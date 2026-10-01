import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { MONTHLY_PRICE_EGP } from '../src/shared/constants/subscription.js';
import {
  USAGE_METRICS,
  applyBillingBalances,
  buildRevenueReport,
  computeDiscountAmount,
  computeMetricUsage,
  computeRevenueSnapshot,
  computeTenantUsage,
  computeWalletMutation,
  monthKey,
  pendingEntitlements,
  roundMoney,
  sumRevenueByPeriod,
  toMoneyNumber,
  verifiedEntitlements,
} from '../src/server/modules/admin/billingMath.js';

const NOW = new Date('2026-09-25T12:00:00.000Z');

describe('BILLING MATH — money normalization', () => {
  test('reads Prisma Decimals, numeric strings and numbers alike', () => {
    assert.equal(toMoneyNumber(new Prisma.Decimal('1199.50')), 1199.5);
    assert.equal(toMoneyNumber('1199'), 1199);
    assert.equal(toMoneyNumber(0), 0);
  });

  test('missing or unparseable money is zero, never NaN', () => {
    assert.equal(toMoneyNumber(null), 0);
    assert.equal(toMoneyNumber(undefined), 0);
    assert.equal(toMoneyNumber('not-a-number'), 0);
    assert.equal(toMoneyNumber(Number.NaN), 0);
  });

  test('rounds to 2 fractional digits the Egyptian Pound standard', () => {
    assert.equal(roundMoney(1199.005), 1199.01);
    assert.equal(roundMoney(0.1 + 0.2), 0.3);
    assert.equal(roundMoney(-5), -5);
    assert.equal(roundMoney(Number.POSITIVE_INFINITY), 0);
  });
});

describe('BILLING MATH — owner discount', () => {
  test('a percentage discount is applied to the monthly price', () => {
    assert.equal(computeDiscountAmount(1199, 'PERCENT', 10), 119.9);
    assert.equal(computeDiscountAmount(1199, 'PERCENT', 25), 299.75);
  });

  test('a percentage above 100 or below 0 is clamped instead of over-refunding', () => {
    assert.equal(computeDiscountAmount(1199, 'PERCENT', 150), 1199);
    assert.equal(computeDiscountAmount(1199, 'PERCENT', -20), 0);
    assert.equal(computeDiscountAmount(1199, 'PERCENT', Number.NaN), 0);
  });

  test('a fixed discount can never exceed the invoice total', () => {
    assert.equal(computeDiscountAmount(1199, 'FIXED', 150), 150);
    assert.equal(computeDiscountAmount(1199, 'FIXED', 5000), 1199);
    assert.equal(computeDiscountAmount(1199, 'FIXED', 0), 0);
  });

  test('the discount never turns an invoice into a negative amount', () => {
    const discount = computeDiscountAmount(1199, 'FIXED', 100_000);
    assert.equal(discount, 1199);
    assert.ok(1199 - discount >= 0);
  });
});

describe('BILLING MATH — balance application (discount wallet then credit wallet)', () => {
  test('with empty wallets the due amount equals the monthly price', () => {
    const result = applyBillingBalances(MONTHLY_PRICE_EGP, 0, 0);
    assert.deepEqual(result, {
      baseAmount: 1199,
      discountApplied: 0,
      creditApplied: 0,
      amountDue: 1199,
      remainingDiscount: 0,
      remainingCredit: 0,
      fullyCovered: false,
    });
  });

  test('discount is spent before credit', () => {
    const result = applyBillingBalances(MONTHLY_PRICE_EGP, 200, 300);
    assert.equal(result.discountApplied, 200);
    assert.equal(result.creditApplied, 300);
    assert.equal(result.amountDue, 699);
    assert.equal(result.remainingDiscount, 0);
    assert.equal(result.remainingCredit, 0);
  });

  test('a wallet larger than the invoice is only partially spent', () => {
    const result = applyBillingBalances(MONTHLY_PRICE_EGP, 2000, 2000);
    assert.equal(result.discountApplied, 1199);
    assert.equal(result.creditApplied, 0);
    assert.equal(result.amountDue, 0);
    assert.equal(result.remainingDiscount, 801);
    assert.equal(result.remainingCredit, 2000);
    assert.equal(result.fullyCovered, true);
  });

  test('credit alone can cover the whole invoice without going negative', () => {
    const result = applyBillingBalances(MONTHLY_PRICE_EGP, 0, 1500.25);
    assert.equal(result.creditApplied, 1199);
    assert.equal(result.amountDue, 0);
    assert.equal(result.remainingCredit, 301.25);
  });

  test('negative wallet balances are treated as zero', () => {
    const result = applyBillingBalances(MONTHLY_PRICE_EGP, -50, -10);
    assert.equal(result.amountDue, 1199);
    assert.equal(result.remainingDiscount, 0);
    assert.equal(result.remainingCredit, 0);
  });

  test('a zero-value invoice is never flagged as fully covered', () => {
    const result = applyBillingBalances(0, 100, 100);
    assert.equal(result.amountDue, 0);
    assert.equal(result.fullyCovered, false);
  });

  test('balances coming from Prisma Decimals behave identically', () => {
    const result = applyBillingBalances(
      new Prisma.Decimal('1199.00'),
      new Prisma.Decimal('199.99'),
      new Prisma.Decimal('1.01'),
    );
    assert.equal(result.amountDue, 998);
    assert.equal(result.remainingDiscount, 0);
    assert.equal(result.remainingCredit, 0);
  });
});

describe('BILLING MATH — wallet ledger mutations', () => {
  test('a discount grant increases only the discount wallet', () => {
    assert.deepEqual(computeWalletMutation('DISCOUNT', 250), { type: 'DISCOUNT', discountDelta: 250, creditDelta: 0 });
  });

  test('a credit grant increases only the credit wallet', () => {
    assert.deepEqual(computeWalletMutation('CREDIT', 100), { type: 'CREDIT', discountDelta: 0, creditDelta: 100 });
  });

  test('a refund returns the same amount as spendable credit', () => {
    assert.deepEqual(computeWalletMutation('REFUND', '499.50'), { type: 'REFUND', discountDelta: 0, creditDelta: 499.5 });
  });

  test('negative or unparseable amounts are normalized to zero', () => {
    assert.equal(computeWalletMutation('CREDIT', -100).creditDelta, 0);
    assert.equal(computeWalletMutation('CREDIT', 'abc').creditDelta, 0);
  });
});

describe('BILLING MATH — usage is a count, never a meter', () => {
  test('a metric reports only its count', () => {
    assert.deepEqual(computeMetricUsage('USERS', 3), { metric: 'USERS', used: 3 });
    assert.deepEqual(computeMetricUsage('VISITS', 9_500), { metric: 'VISITS', used: 9_500 });
  });

  test('a non-finite count is zero, never NaN', () => {
    assert.equal(computeMetricUsage('STUDENTS', Number.NaN).used, 0);
  });

  test('a metric carries no limit, percent, remaining or warning level', () => {
    const state = computeMetricUsage('VISITS', 9_999) as unknown as Record<string, unknown>;
    for (const forbidden of ['limit', 'percent', 'remaining', 'level', 'warning']) {
      assert.equal(forbidden in state, false, `a count-only metric still exposes "${forbidden}"`);
    }
  });

  test('a center far past any former cap is still just a count — nothing warns, nothing blocks', () => {
    const summary = computeTenantUsage({
      userCount: 120,
      receptionistCount: 9,
      studentCount: 4000,
      visitCount: 250_000,
      branchCount: 12,
    });
    assert.deepEqual(
      summary.metrics.map((metric) => metric.metric),
      [...USAGE_METRICS],
    );
    assert.deepEqual(
      summary.metrics.map((metric) => metric.used),
      [120, 9, 4000, 250_000, 12],
    );
    assert.deepEqual(Object.keys(summary), ['metrics'], 'the summary grew a limit/override field');
  });

  test('branch usage defaults to zero when the caller has no branch count', () => {
    const summary = computeTenantUsage({
      userCount: 1,
      receptionistCount: 1,
      studentCount: 0,
      visitCount: 0,
    });
    const branches = summary.metrics.find((metric) => metric.metric === 'BRANCHES')!;
    assert.equal(branches.used, 0);
  });

  test('every documented metric is always present in the summary', () => {
    const summary = computeTenantUsage({
      userCount: 0,
      receptionistCount: 0,
      studentCount: 0,
      visitCount: 0,
    });
    assert.deepEqual(summary.metrics.map((metric) => metric.metric), [...USAGE_METRICS]);
  });
});

describe('BILLING MATH — revenue', () => {
  test('MRR counts only subscriptions whose period has not lapsed', () => {
    const snapshot = computeRevenueSnapshot(
      [
        { amount: 1199, periodEnd: '2026-10-25T00:00:00.000Z' },
        { amount: 1199, periodEnd: '2026-10-01T00:00:00.000Z' },
        { amount: 1199, periodEnd: '2026-09-01T00:00:00.000Z' },
        { amount: 0, periodEnd: '2026-12-01T00:00:00.000Z' },
      ],
      NOW,
    );
    assert.equal(snapshot.mrr, 2398);
    assert.equal(snapshot.atRisk, 1199);
  });

  test('a zero-amount trial never counts as revenue', () => {
    const snapshot = computeRevenueSnapshot([{ amount: 0, periodEnd: '2026-12-01T00:00:00.000Z' }], NOW);
    assert.equal(snapshot.mrr, 0);
    assert.equal(snapshot.atRisk, 0);
  });

  test('revenue history is zero-filled and chronological', () => {
    const points = sumRevenueByPeriod([{ amount: 1199, periodStart: '2026-09-02T00:00:00.000Z' }], 3, NOW);
    assert.deepEqual(points.map((point) => point.key), ['2026-07', '2026-08', '2026-09']);
    assert.equal(points[0].amount, 0);
    assert.equal(points[2].amount, 1199);
    assert.equal(points[2].count, 1);
  });

  test('revenue history ignores months outside the requested window', () => {
    const points = sumRevenueByPeriod([{ amount: 100, periodStart: '2025-01-05T00:00:00.000Z' }], 6, NOW);
    assert.equal(points.reduce((sum, point) => sum + point.amount, 0), 0);
  });

  test('the month count is clamped to a sane range', () => {
    assert.equal(sumRevenueByPeriod([], 0, NOW).length, 1);
    assert.equal(sumRevenueByPeriod([], 99, NOW).length, 24);
  });

  test('the report totals match the sum of its history points', () => {
    const report = buildRevenueReport(
      [
        { amount: 1199, periodStart: '2026-09-01T00:00:00.000Z', periodEnd: '2026-10-01T00:00:00.000Z' },
        { amount: 1199, periodStart: '2026-08-01T00:00:00.000Z', periodEnd: '2026-11-01T00:00:00.000Z' },
      ],
      6,
      NOW,
    );
    assert.equal(report.mrr, 2398);
    assert.equal(report.historyTotal, report.history.reduce((sum, point) => sum + point.amount, 0));
    assert.equal(report.historyTotal, 2398);
    assert.equal(monthKey(NOW), '2026-09');
  });

  test('the report carries no per-plan breakdown — there is one product', () => {
    const report = buildRevenueReport(
      [{ amount: 1199, periodStart: '2026-09-01T00:00:00.000Z', periodEnd: '2026-10-01T00:00:00.000Z' }],
      6,
      NOW,
    );
    assert.equal('byPlan' in report, false);
    assert.deepEqual(
      Object.keys(report).sort(),
      ['atRisk', 'history', 'historyTotal', 'mrr'],
    );
  });

  test('a lapsed subscription is excluded from the history but still reported at risk', () => {
    const report = buildRevenueReport(
      [{ amount: 1199, periodStart: '2026-09-01T00:00:00.000Z', periodEnd: '2026-09-20T00:00:00.000Z' }],
      6,
      NOW,
    );
    assert.equal(report.mrr, 0);
    assert.equal(report.atRisk, 1199);
    assert.equal(report.historyTotal, 0);
  });
});

describe('SUBSCRIPTION ENTITLEMENTS — no paid month before payment is verified', () => {
  test('a pending payment grants nothing active and settles nothing', () => {
    const granted = pendingEntitlements(0, 0);

    assert.equal(granted.isActive, false);
    assert.equal(granted.billing, null);
  });

  test('a pending payment carries no limit, tier or plan of any kind', () => {
    const granted = pendingEntitlements(0, 0) as unknown as Record<string, unknown>;
    for (const forbidden of ['plan', 'limits', 'maxDesks', 'maxUsers', 'visitLimit']) {
      assert.equal(forbidden in granted, false, `a pending tenant still carries "${forbidden}"`);
    }
  });

  test('a pending payment leaves owner wallets untouched, so a reject has nothing to unwind', () => {
    const granted = pendingEntitlements(250, 100);

    assert.equal(granted.discountBalance, 250);
    assert.equal(granted.creditBalance, 100);
  });

  test('negative wallets are clamped even while pending', () => {
    const granted = pendingEntitlements(-50, -10);
    assert.equal(granted.discountBalance, 0);
    assert.equal(granted.creditBalance, 0);
  });

  test('verifying activates the tenant and settles the invoice at the monthly price', () => {
    const granted = verifiedEntitlements(0, 0);

    assert.equal(granted.isActive, true);
    assert.equal(granted.billing?.baseAmount, MONTHLY_PRICE_EGP);
    assert.equal(granted.billing?.amountDue, 1199);
    assert.equal(granted.billing?.fullyCovered, false);
  });

  test('verifying spends the wallets exactly once', () => {
    const granted = verifiedEntitlements(200, 0);

    assert.equal(granted.billing?.discountApplied, 200);
    assert.equal(granted.billing?.amountDue, 999);
    assert.equal(granted.discountBalance, 0);
    assert.equal(granted.creditBalance, 0);
  });

  test('a discount granted while the payment was pending is honoured at verification', () => {
    // Priced at payment time against a zero wallet, then granted one later.
    const atPayment = applyBillingBalances(MONTHLY_PRICE_EGP, 0, 0);
    assert.equal(atPayment.amountDue, 1199);

    const atVerify = verifiedEntitlements(500, 0);
    assert.equal(atVerify.billing?.amountDue, 699);
    assert.equal(atVerify.discountBalance, 0);
  });

  test('a wallet that fully covers the invoice still activates and is not double-spent', () => {
    const granted = verifiedEntitlements(0, 2000);

    assert.equal(granted.isActive, true);
    assert.equal(granted.billing?.fullyCovered, true);
    assert.equal(granted.billing?.amountDue, 0);
    assert.equal(granted.creditBalance, 801);
  });
});
