/**
 * Pure billing/usage math for the super-admin console.
 *
 * Every formula that turns the subscription price into a payable amount — or an
 * owner's discount/credit decision into a balance — lives here so it can be
 * unit-tested in isolation. Route modules and UI components must never
 * re-implement any of it (AGENTS.md: financial arithmetic isolation).
 *
 * The subscription is a single unlimited product, so nothing here knows about
 * plans, caps, or usage overrides. Usage is reported as counts, never as a
 * percentage of a limit. Optional capabilities appear only as extra invoice
 * lines (computeInvoicePreview) — they never introduce a second product.
 */
import { Prisma } from '@prisma/client';
import { ADDON_LABEL_AR, ADDON_LABEL_EN, ADDON_MONTHLY_PRICE_EGP, BASE_LINE_CODE, BASE_LINE_LABEL_AR, BASE_LINE_LABEL_EN, BILLABLE_ADDONS, MONTHLY_PRICE_EGP, } from '../../../shared/constants/subscription.js';
/** Converts any Prisma/JSON money representation to a plain number. */
export function toMoneyNumber(value) {
    if (value === null || value === undefined)
        return 0;
    if (value instanceof Prisma.Decimal)
        return value.toNumber();
    const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
}
/** Currency amounts are EGP with 2 fractional digits. */
export function roundMoney(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
/**
 * Owner-entered discount for a subscription invoice. A percentage is clamped
 * to 0..100, a fixed amount to 0..price — a discount can never turn an
 * invoice into a payout.
 */
export function computeDiscountAmount(price, kind, value) {
    const base = Math.max(0, toMoneyNumber(price));
    if (!Number.isFinite(value) || value <= 0)
        return 0;
    if (kind === 'PERCENT') {
        return roundMoney(base * (Math.min(100, value) / 100));
    }
    return roundMoney(Math.min(base, value));
}
/**
 * Spends the tenant's wallets against a new invoice: discount first (a
 * discount reduces what is owed), then credit (a credit pays the remainder).
 * The returned remainders are the new wallet balances.
 */
export function applyBillingBalances(price, discountBalance, creditBalance) {
    const baseAmount = roundMoney(Math.max(0, toMoneyNumber(price)));
    const availableDiscount = roundMoney(Math.max(0, toMoneyNumber(discountBalance)));
    const availableCredit = roundMoney(Math.max(0, toMoneyNumber(creditBalance)));
    const discountApplied = roundMoney(Math.min(baseAmount, availableDiscount));
    const afterDiscount = roundMoney(baseAmount - discountApplied);
    const creditApplied = roundMoney(Math.min(afterDiscount, availableCredit));
    const amountDue = roundMoney(afterDiscount - creditApplied);
    return {
        baseAmount,
        discountApplied,
        creditApplied,
        amountDue,
        remainingDiscount: roundMoney(availableDiscount - discountApplied),
        remainingCredit: roundMoney(availableCredit - creditApplied),
        fullyCovered: baseAmount > 0 && amountDue === 0,
    };
}
/**
 * How one ledger entry changes the tenant wallets.
 *   DISCOUNT  — grant discount to spend on future invoices.
 *   CREDIT    — grant credit to spend on future invoices.
 *   REFUND    — hand money back: the refund is recorded for the ledger and
 *               the same amount is returned as spendable credit.
 */
export function computeWalletMutation(type, amount) {
    const value = roundMoney(Math.max(0, toMoneyNumber(amount)));
    if (type === 'DISCOUNT')
        return { type, discountDelta: value, creditDelta: 0 };
    if (type === 'CREDIT')
        return { type, discountDelta: 0, creditDelta: value };
    return { type, discountDelta: 0, creditDelta: value };
}
/** Keeps only codes that are actually billable, de-duplicated, in catalogue order. */
export function normalizeAddonCodes(codes) {
    const wanted = new Set();
    for (const code of codes ?? []) {
        if (typeof code === 'string')
            wanted.add(code);
    }
    return BILLABLE_ADDONS.filter((code) => wanted.has(code));
}
/**
 * The priced lines of one invoice period: the base platform plus one line per
 * enabled add-on.
 *
 * Every billing path — signup, renewal, verification, and the console preview —
 * must derive the amount it charges from here, so a center can never be quoted
 * one total and charged another. Unknown codes are dropped rather than priced at
 * zero: a code that is not in the catalogue has no agreed price, and silently
 * billing it EGP 0 would hand out a paid add-on for free.
 */
export function computeInvoicePreview(addonCodes, baseAmount = MONTHLY_PRICE_EGP) {
    const base = roundMoney(Math.max(0, toMoneyNumber(baseAmount)));
    const addonLines = normalizeAddonCodes(addonCodes).map((code) => ({
        code,
        labelEn: ADDON_LABEL_EN[code],
        labelAr: ADDON_LABEL_AR[code],
        amount: roundMoney(ADDON_MONTHLY_PRICE_EGP[code]),
    }));
    const total = roundMoney(base + addonLines.reduce((sum, line) => sum + line.amount, 0));
    return { baseAmount: base, addonLines, total };
}
/**
 * What this period costs, ignoring wallets. Convenience wrapper over
 * computeInvoicePreview for the many call sites that only need a number.
 */
export function computeInvoiceTotal(addonCodes) {
    return computeInvoicePreview(addonCodes).total;
}
/**
 * The rows to freeze onto a subscription when it is invoiced. Callers persist
 * this so a later price change or add-on cancellation cannot rewrite a period
 * that has already been billed.
 */
export function buildSubscriptionLineItems(addonCodes) {
    const preview = computeInvoicePreview(addonCodes);
    return [
        {
            code: BASE_LINE_CODE,
            labelEn: BASE_LINE_LABEL_EN,
            labelAr: BASE_LINE_LABEL_AR,
            amount: preview.baseAmount,
        },
        ...preview.addonLines,
    ];
}
/**
 * Entitlements for a tenant whose payment is still unverified. Owner-granted
 * discount/credit wallets are deliberately left untouched, so rejecting the
 * payment has nothing to unwind — the tenant simply never received the month.
 */
export function pendingEntitlements(discountBalance, creditBalance) {
    return {
        isActive: false,
        discountBalance: roundMoney(Math.max(0, toMoneyNumber(discountBalance))),
        creditBalance: roundMoney(Math.max(0, toMoneyNumber(creditBalance))),
        billing: null,
    };
}
/**
 * Entitlements granted once the payment is verified: an active subscription and
 * the owner wallets spent against this invoice. The wallet math is recomputed
 * here from the tenant's live balances so a discount granted while the payment
 * was pending is honoured.
 *
 * `addonCodes` must be the add-ons that were on the invoice being verified, not
 * the tenant's add-ons as they stand now: the amount the center transferred is
 * the amount the wallets must be applied to.
 */
export function verifiedEntitlements(discountBalance, creditBalance, addonCodes = []) {
    const billing = applyBillingBalances(computeInvoiceTotal(addonCodes), discountBalance, creditBalance);
    return {
        isActive: true,
        discountBalance: billing.remainingDiscount,
        creditBalance: billing.remainingCredit,
        billing,
    };
}
// ─── Usage aggregation ───────────────────────────────────────────────────────
export const USAGE_METRICS = ['USERS', 'RECEPTIONISTS', 'STUDENTS', 'VISITS', 'BRANCHES'];
/** Counts only: the product is unlimited, so no metric has a limit or a level. */
export function computeMetricUsage(metric, used) {
    return { metric, used: Number.isFinite(used) ? used : 0 };
}
/** Builds the per-center usage counts shown in the console. */
export function computeTenantUsage(input) {
    return {
        metrics: [
            computeMetricUsage('USERS', input.userCount),
            computeMetricUsage('RECEPTIONISTS', input.receptionistCount),
            computeMetricUsage('STUDENTS', input.studentCount),
            computeMetricUsage('VISITS', input.visitCount),
            computeMetricUsage('BRANCHES', input.branchCount ?? 0),
        ],
    };
}
export function monthKey(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}
/**
 * Revenue history for the last `months` calendar months, zero-filled so the
 * chart never has holes. Only ACTIVE subscriptions count as recognized
 * revenue, and only for the month their period started in.
 */
export function sumRevenueByPeriod(rows, months, now) {
    const safeMonths = Math.max(1, Math.min(24, Math.floor(months)));
    const keys = [];
    for (let offset = safeMonths - 1; offset >= 0; offset -= 1) {
        keys.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))));
    }
    const points = new Map(keys.map((key) => [key, { key, amount: 0, count: 0 }]));
    for (const row of rows) {
        const point = points.get(monthKey(new Date(row.periodStart)));
        if (!point)
            continue;
        point.amount = roundMoney(point.amount + Math.max(0, toMoneyNumber(row.amount)));
        point.count += 1;
    }
    return keys.map((key) => points.get(key));
}
/**
 * Recognized monthly recurring revenue: the active subscription that covers
 * "now" for every paying center. Centers whose current period has lapsed are
 * not MRR — they are reported separately as at-risk revenue.
 */
export function computeRevenueSnapshot(rows, now) {
    let mrr = 0;
    let atRisk = 0;
    for (const row of rows) {
        const amount = roundMoney(Math.max(0, toMoneyNumber(row.amount)));
        if (amount <= 0)
            continue;
        if (new Date(row.periodEnd).getTime() > now.getTime())
            mrr = roundMoney(mrr + amount);
        else
            atRisk = roundMoney(atRisk + amount);
    }
    return { mrr, atRisk };
}
/** Convenience wrapper: snapshot + history from one query result. */
export function buildRevenueReport(rows, months, now) {
    const snapshot = computeRevenueSnapshot(rows, now);
    const history = sumRevenueByPeriod(rows.filter((row) => new Date(row.periodEnd).getTime() > now.getTime()), months, now);
    return { ...snapshot, history, historyTotal: roundMoney(history.reduce((sum, point) => sum + point.amount, 0)) };
}
