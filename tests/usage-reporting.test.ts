import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MONTHLY_PRICE_EGP, SUBSCRIPTION_CURRENCY, TRIAL_DAYS } from '../src/shared/constants/subscription.js';
import { MADAR_OFFER, foundingDiscountPercent } from '../src/shared/constants/offers.js';
import { computeBillingPeriod } from '../src/server/modules/subscriptions/usageService.js';
import { SubscriptionStatus } from '../src/shared/constants/index.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('Single Madar subscription constants', () => {
  it('charges one price, in EGP, for a 14-day trial', () => {
    assert.equal(MONTHLY_PRICE_EGP, 1199);
    assert.equal(SUBSCRIPTION_CURRENCY, 'EGP');
    assert.equal(TRIAL_DAYS, 14);
  });

  it('sells exactly one offer, and it is priced at the monthly price', () => {
    assert.equal(MADAR_OFFER.listPriceEgp, 1999);
    assert.equal(MADAR_OFFER.foundingPriceEgp, MONTHLY_PRICE_EGP);
  });

  it('advertises the founding discount as a percentage of the list price', () => {
    // (1999 - 1199) / 1999 = 40.04% -> 40%
    assert.equal(foundingDiscountPercent(MADAR_OFFER), 40);
  });

  it('reports no discount when the offer is not actually reduced', () => {
    assert.equal(foundingDiscountPercent({ ...MADAR_OFFER, foundingPriceEgp: MADAR_OFFER.listPriceEgp }), null);
    assert.equal(foundingDiscountPercent({ ...MADAR_OFFER, foundingPriceEgp: 2500 }), null);
  });
});

describe('Plans are gone for good', () => {
  it('the plan catalogue module no longer exists', () => {
    assert.equal(existsSync(join(ROOT, 'src/shared/constants/plans.ts')), false);
    assert.equal(existsSync(join(ROOT, 'src/shared/constants/plans.js')), false);
  });

  it('the schema no longer carries a plan column on tenants or subscriptions', () => {
    const schema = readFileSync(join(ROOT, 'prisma/schema.prisma'), 'utf8');
    assert.doesNotMatch(schema, /^\s*plan\s+String/m, 'a plan column survived in prisma/schema.prisma');
    assert.doesNotMatch(schema, /model TenantPlan/, 'the TenantPlan model survived');
    assert.doesNotMatch(schema, /model UsageOverride/, 'the UsageOverride model survived');
  });

  it('the entitlement gate helpers that could block a center are gone', async () => {
    const usageModule = await import('../src/server/modules/subscriptions/usageService.js');
    const surface = Object.keys(usageModule) as string[];
    for (const removed of ['canCheckIn', 'canAddReceptionist', 'canAddBranch', 'calculateUsageWarning']) {
      assert.equal(surface.includes(removed), false, `${removed} is still exported`);
    }
  });
});

describe('Usage is reported as counts, never as a percentage of a limit', () => {
  it('the usage summary type carries no limit, percentage, or warning level', () => {
    const source = readFileSync(join(ROOT, 'src/server/modules/subscriptions/usageService.ts'), 'utf8');
    const interfaceBody = source.slice(
      source.indexOf('export interface TenantUsageSummary'),
      source.indexOf('}', source.indexOf('export interface TenantUsageSummary')),
    );
    for (const forbidden of ['limit', 'percentage', 'remaining', 'warningLevel', 'isBlocked', 'plan']) {
      assert.equal(
        new RegExp(`\\b${forbidden}\\b`, 'i').test(interfaceBody),
        false,
        `TenantUsageSummary still mentions "${forbidden}"`,
      );
    }
  });
});

describe('Billing Period and Monthly Reset Architecture', () => {
  it('computes correct calendar month boundaries when no active subscription exists', () => {
    const midMonth = new Date('2026-03-15T14:30:00Z');
    const period = computeBillingPeriod(midMonth, null);

    assert.equal(period.periodStart.getUTCFullYear(), 2026);
    assert.equal(period.periodStart.getUTCMonth(), 2); // March is index 2
    assert.equal(period.periodStart.getUTCDate(), 1);
    assert.equal(period.periodStart.getUTCHours(), 0);

    assert.equal(period.periodEnd.getUTCFullYear(), 2026);
    assert.equal(period.periodEnd.getUTCMonth(), 3); // April is index 3
    assert.equal(period.periodEnd.getUTCDate(), 1);
    assert.equal(period.periodEnd.getUTCHours(), 0);
  });

  it('rolls the calendar month over a December boundary without skipping a year', () => {
    const december = new Date('2026-12-20T00:00:00Z');
    const period = computeBillingPeriod(december, null);

    assert.equal(period.periodStart.toISOString(), '2026-12-01T00:00:00.000Z');
    assert.equal(period.periodEnd.toISOString(), '2027-01-01T00:00:00.000Z');
  });

  it('uses active subscription billing boundaries when subscription is valid and current', () => {
    const subStart = new Date('2026-03-10T00:00:00Z');
    const subEnd = new Date('2026-04-10T00:00:00Z');
    const now = new Date('2026-03-20T12:00:00Z');

    const period = computeBillingPeriod(now, {
      periodStart: subStart,
      periodEnd: subEnd,
    });

    assert.equal(period.periodStart.toISOString(), subStart.toISOString());
    assert.equal(period.periodEnd.toISOString(), subEnd.toISOString());
  });

  it('ignores a pending subscription — an unverified payment never sets the window', () => {
    const now = new Date('2026-03-20T12:00:00Z');
    const period = computeBillingPeriod(now, {
      periodStart: new Date('2026-03-10T00:00:00Z'),
      periodEnd: new Date('2026-04-10T00:00:00Z'),
      status: SubscriptionStatus.PENDING,
    });

    assert.equal(period.periodStart.toISOString(), '2026-03-01T00:00:00.000Z');
    assert.equal(period.periodEnd.toISOString(), '2026-04-01T00:00:00.000Z');
  });

  it('falls back to the calendar month once a paid period has lapsed', () => {
    const now = new Date('2026-05-05T00:00:00Z');
    const period = computeBillingPeriod(now, {
      periodStart: new Date('2026-03-10T00:00:00Z'),
      periodEnd: new Date('2026-04-10T00:00:00Z'),
      status: SubscriptionStatus.ACTIVE,
    });

    assert.equal(period.periodStart.toISOString(), '2026-05-01T00:00:00.000Z');
    assert.equal(period.periodEnd.toISOString(), '2026-06-01T00:00:00.000Z');
  });
});
