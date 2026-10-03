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
import {
  ADDON_LABEL_AR,
  ADDON_LABEL_EN,
  ADDON_MONTHLY_PRICE_EGP,
  BASE_LINE_CODE,
  BASE_LINE_LABEL_AR,
  BASE_LINE_LABEL_EN,
  BILLABLE_ADDONS,
  MONTHLY_PRICE_EGP,
  type BillableAddonCode,
} from '../../../shared/constants/subscription.js';

export type MoneyInput = Prisma.Decimal | number | string | null | undefined;

/** Converts any Prisma/JSON money representation to a plain number. */
export function toMoneyNumber(value: MoneyInput): number {
  if (value === null || value === undefined) return 0;
  if (value instanceof Prisma.Decimal) return value.toNumber();
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Currency amounts are EGP with 2 fractional digits. */
export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type DiscountKind = 'PERCENT' | 'FIXED';

/**
 * Owner-entered discount for a subscription invoice. A percentage is clamped
 * to 0..100, a fixed amount to 0..price — a discount can never turn an
 * invoice into a payout.
 */
export function computeDiscountAmount(price: MoneyInput, kind: DiscountKind, value: number): number {
  const base = Math.max(0, toMoneyNumber(price));
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (kind === 'PERCENT') {
    return roundMoney(base * (Math.min(100, value) / 100));
  }
  return roundMoney(Math.min(base, value));
}

export type BalanceApplication = {
  /** Subscription price before any owner adjustment. */
  baseAmount: number;
  /** Portion of the tenant discount wallet consumed by this invoice. */
  discountApplied: number;
  /** Portion of the tenant credit wallet consumed by this invoice. */
  creditApplied: number;
  /** What the center must actually pay (never below 0). */
  amountDue: number;
  remainingDiscount: number;
  remainingCredit: number;
  /** True when the wallet fully covered the invoice (amountDue === 0). */
  fullyCovered: boolean;
};

/**
 * Spends the tenant's wallets against a new invoice: discount first (a
 * discount reduces what is owed), then credit (a credit pays the remainder).
 * The returned remainders are the new wallet balances.
 */
export function applyBillingBalances(
  price: MoneyInput,
  discountBalance: MoneyInput,
  creditBalance: MoneyInput,
): BalanceApplication {
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

export type WalletAction = 'DISCOUNT' | 'CREDIT' | 'REFUND';

export type WalletMutation = {
  type: WalletAction;
  discountDelta: number;
  creditDelta: number;
};

/**
 * How one ledger entry changes the tenant wallets.
 *   DISCOUNT  — grant discount to spend on future invoices.
 *   CREDIT    — grant credit to spend on future invoices.
 *   REFUND    — hand money back: the refund is recorded for the ledger and
 *               the same amount is returned as spendable credit.
 */
export function computeWalletMutation(type: WalletAction, amount: MoneyInput): WalletMutation {
  const value = roundMoney(Math.max(0, toMoneyNumber(amount)));
  if (type === 'DISCOUNT') return { type, discountDelta: value, creditDelta: 0 };
  if (type === 'CREDIT') return { type, discountDelta: 0, creditDelta: value };
  return { type, discountDelta: 0, creditDelta: value };
}

// ─── Add-on invoice math ──────────────────────────────────────────────────────

export type InvoiceLine = {
  code: string;
  labelEn: string;
  labelAr: string;
  amount: number;
};

export type InvoicePreview = {
  /** The platform line, always first. */
  baseAmount: number;
  /** One line per enabled add-on, in BILLABLE_ADDONS order. */
  addonLines: InvoiceLine[];
  /** baseAmount + every add-on line. This is what the center pays. */
  total: number;
};

/** Keeps only codes that are actually billable, de-duplicated, in catalogue order. */
export function normalizeAddonCodes(codes: Iterable<string> | null | undefined): BillableAddonCode[] {
  const wanted = new Set<string>();
  for (const code of codes ?? []) {
    if (typeof code === 'string') wanted.add(code);
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
export function computeInvoicePreview(
  addonCodes: Iterable<string> | null | undefined,
  baseAmount: MoneyInput = MONTHLY_PRICE_EGP,
): InvoicePreview {
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
export function computeInvoiceTotal(addonCodes: Iterable<string> | null | undefined): number {
  return computeInvoicePreview(addonCodes).total;
}

/**
 * The rows to freeze onto a subscription when it is invoiced. Callers persist
 * this so a later price change or add-on cancellation cannot rewrite a period
 * that has already been billed.
 */
export function buildSubscriptionLineItems(addonCodes: Iterable<string> | null | undefined) {
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

// ─── Subscription entitlements ───────────────────────────────────────────────

/**
 * What a tenant may actually use, derived from the state of its payment.
 *
 * A PENDING payment must never activate the paid subscription. The tenant stays
 * on its (unlimited) trial-tier activity, but nothing that was paid for is
 * granted until a SUPER_ADMIN verifies the transfer (AGENTS.md: financial
 * isolation + no entitlement before payment).
 */
export type TenantEntitlements = {
  isActive: boolean;
  discountBalance: number;
  creditBalance: number;
  /** Wallet spend for this invoice; null when no invoice is being settled. */
  billing: BalanceApplication | null;
};

/**
 * Entitlements for a tenant whose payment is still unverified. Owner-granted
 * discount/credit wallets are deliberately left untouched, so rejecting the
 * payment has nothing to unwind — the tenant simply never received the month.
 */
export function pendingEntitlements(
  discountBalance: MoneyInput,
  creditBalance: MoneyInput,
): TenantEntitlements {
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
export function verifiedEntitlements(
  discountBalance: MoneyInput,
  creditBalance: MoneyInput,
  addonCodes: Iterable<string> | null | undefined = [],
): TenantEntitlements {
  const billing = applyBillingBalances(computeInvoiceTotal(addonCodes), discountBalance, creditBalance);
  return {
    isActive: true,
    discountBalance: billing.remainingDiscount,
    creditBalance: billing.remainingCredit,
    billing,
  };
}

// ─── Usage aggregation ───────────────────────────────────────────────────────

export const USAGE_METRICS = ['USERS', 'RECEPTIONISTS', 'STUDENTS', 'VISITS', 'BRANCHES'] as const;
export type UsageMetric = (typeof USAGE_METRICS)[number];

export type UsageMetricState = {
  metric: UsageMetric;
  used: number;
};

/** Counts only: the product is unlimited, so no metric has a limit or a level. */
export function computeMetricUsage(metric: UsageMetric, used: number): UsageMetricState {
  return { metric, used: Number.isFinite(used) ? used : 0 };
}

export type TenantUsageInput = {
  userCount: number;
  receptionistCount: number;
  studentCount: number;
  visitCount: number;
  branchCount?: number;
};

export type TenantUsageSummary = {
  metrics: UsageMetricState[];
};

/** Builds the per-center usage counts shown in the console. */
export function computeTenantUsage(input: TenantUsageInput): TenantUsageSummary {
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

// ─── Revenue math ────────────────────────────────────────────────────────────

export type RevenueSeriesPoint = {
  /** Calendar month key, YYYY-MM. */
  key: string;
  /** Paid revenue recognized in that month. */
  amount: number;
  /** Number of subscriptions recognized in that month. */
  count: number;
};

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Revenue history for the last `months` calendar months, zero-filled so the
 * chart never has holes. Only ACTIVE subscriptions count as recognized
 * revenue, and only for the month their period started in.
 */
export function sumRevenueByPeriod(
  rows: Array<{ amount: MoneyInput; periodStart: Date | string }>,
  months: number,
  now: Date,
): RevenueSeriesPoint[] {
  const safeMonths = Math.max(1, Math.min(24, Math.floor(months)));
  const keys: string[] = [];
  for (let offset = safeMonths - 1; offset >= 0; offset -= 1) {
    keys.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))));
  }

  const points = new Map<string, RevenueSeriesPoint>(
    keys.map((key) => [key, { key, amount: 0, count: 0 }]),
  );

  for (const row of rows) {
    const point = points.get(monthKey(new Date(row.periodStart)));
    if (!point) continue;
    point.amount = roundMoney(point.amount + Math.max(0, toMoneyNumber(row.amount)));
    point.count += 1;
  }

  return keys.map((key) => points.get(key)!);
}

/**
 * Recognized monthly recurring revenue: the active subscription that covers
 * "now" for every paying center. Centers whose current period has lapsed are
 * not MRR — they are reported separately as at-risk revenue.
 */
export function computeRevenueSnapshot(rows: Array<{ amount: MoneyInput; periodEnd: Date | string }>, now: Date) {
  let mrr = 0;
  let atRisk = 0;

  for (const row of rows) {
    const amount = roundMoney(Math.max(0, toMoneyNumber(row.amount)));
    if (amount <= 0) continue;
    if (new Date(row.periodEnd).getTime() > now.getTime()) mrr = roundMoney(mrr + amount);
    else atRisk = roundMoney(atRisk + amount);
  }

  return { mrr, atRisk };
}

export type RevenueRow = { amount: MoneyInput; periodStart: Date | string; periodEnd: Date | string };

/** Convenience wrapper: snapshot + history from one query result. */
export function buildRevenueReport(rows: RevenueRow[], months: number, now: Date) {
  const snapshot = computeRevenueSnapshot(rows, now);
  const history = sumRevenueByPeriod(
    rows.filter((row) => new Date(row.periodEnd).getTime() > now.getTime()),
    months,
    now,
  );
  return { ...snapshot, history, historyTotal: roundMoney(history.reduce((sum, point) => sum + point.amount, 0)) };
}
