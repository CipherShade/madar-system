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
 * percentage of a limit.
 */

import { Prisma } from '@prisma/client';
import { MONTHLY_PRICE_EGP } from '../../../shared/constants/subscription.js';

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
 */
export function verifiedEntitlements(
  discountBalance: MoneyInput,
  creditBalance: MoneyInput,
): TenantEntitlements {
  const billing = applyBillingBalances(MONTHLY_PRICE_EGP, discountBalance, creditBalance);
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
