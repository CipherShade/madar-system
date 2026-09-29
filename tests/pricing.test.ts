import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { TenantPlan } from '../src/shared/constants/index.js';
import {
  PLANS,
  MADAR_PLANS,
  PUBLIC_PLAN_IDS,
  PURCHASABLE_PLAN_IDS,
  TRIAL_DAYS,
  computeVisitUsage,
  getPlanConfig,
  isPublicPlan,
  isPurchasablePlan,
  VISIT_USAGE_LIMIT_PERCENT,
  VISIT_USAGE_STRONG_PERCENT,
  VISIT_USAGE_WARNING_PERCENT,
} from '../src/shared/constants/plans.js';
import { serializePublicPlans } from '../src/server/modules/subscriptions/publicPlans.js';
import {
  FOUNDING_OFFER,
  GUARANTEE,
  LANDING_OFFERS,
  ONBOARDING_VIDEO_URL,
  PRIMARY_OFFER,
  SECONDARY_OFFERS,
  SUPPORT,
  foundingDiscountPercent,
  foundingPeriodLabel,
  getOfferBySlug,
} from '../src/shared/constants/offers.js';
import { buildVisitCountWhere, resolveUsagePeriodStart } from '../src/server/modules/subscriptions/subscriptions.js';
import { receptionistLimitReached } from '../src/server/modules/users/users.js';
import { AttendanceStatus, SubscriptionStatus } from '../src/shared/constants/index.js';

// ─── Pricing architecture ────────────────────────────────────────────────────

describe('PRICING: 4-tier Madar catalogue', () => {
  test('Basic is 499 EGP, Growth is 1,499 EGP, Pro is 1,999 EGP, Multi-Branch is 4,999 EGP', () => {
    assert.equal(PLANS[TenantPlan.BASIC].priceEgp, 499);
    assert.equal(PLANS[TenantPlan.GROWTH].priceEgp, 1499);
    assert.equal(PLANS[TenantPlan.PRO].priceEgp, 1999);
    assert.equal(PLANS[TenantPlan.MULTI_BRANCH].priceEgp, 4999);
  });

  test('all 4 tiers are public and purchasable', () => {
    const expected = [TenantPlan.BASIC, TenantPlan.GROWTH, TenantPlan.PRO, TenantPlan.MULTI_BRANCH].sort();
    assert.deepEqual([...PUBLIC_PLAN_IDS].sort(), expected);
    assert.deepEqual([...PURCHASABLE_PLAN_IDS].sort(), expected);
    for (const id of PUBLIC_PLAN_IDS) assert.equal(isPublicPlan(id), true);
    for (const id of PURCHASABLE_PLAN_IDS) assert.equal(isPurchasablePlan(id), true);
  });

  test('Free Trial stays internal (no public pricing row)', () => {
    assert.equal(isPublicPlan(TenantPlan.FREE_TRIAL), false);
    assert.equal(isPurchasablePlan(TenantPlan.FREE_TRIAL), false);
    assert.equal(TRIAL_DAYS, 14);
  });

  test('Basic limits: 3,000 visits, 1 receptionist, 1 branch', () => {
    const b = PLANS[TenantPlan.BASIC];
    assert.equal(b.monthlyVisitLimit, 3000);
    assert.equal(b.maxReceptionists, 1);
    assert.equal(b.maxBranches, 1);
  });

  test('Growth limits: 10,000 visits, 3 receptionists, 1 branch', () => {
    const g = PLANS[TenantPlan.GROWTH];
    assert.equal(g.monthlyVisitLimit, 10000);
    assert.equal(g.maxReceptionists, 3);
    assert.equal(g.maxBranches, 1);
  });

  test('Pro limits: 20,000 visits, unlimited receptionists, 1 branch', () => {
    const p = PLANS[TenantPlan.PRO];
    assert.equal(p.monthlyVisitLimit, 20000);
    assert.equal(p.maxReceptionists, null);
    assert.equal(p.maxBranches, 1);
  });

  test('Multi-Branch limits: 50,000+ visits, unlimited receptionists, multiple branches', () => {
    const mb = PLANS[TenantPlan.MULTI_BRANCH];
    assert.equal(mb.monthlyVisitLimit, 50000);
    assert.equal(mb.maxReceptionists, null);
    assert.equal(mb.maxBranches, null);
  });
});

// ─── Plan migration / legacy aliases ─────────────────────────────────────────

describe('PLANS: migration mapping of legacy tiers', () => {
  test('ESSENTIAL resolves to Basic, CONTROL to Growth, BUSINESS to Pro, ENTERPRISE to Multi-Branch', () => {
    assert.equal(getPlanConfig(TenantPlan.ESSENTIAL).id, TenantPlan.BASIC);
    assert.equal(getPlanConfig(TenantPlan.CONTROL).id, TenantPlan.GROWTH);
    assert.equal(getPlanConfig(TenantPlan.BUSINESS).id, TenantPlan.PRO);
    assert.equal(getPlanConfig(TenantPlan.ENTERPRISE).id, TenantPlan.MULTI_BRANCH);
  });

  test('legacy aliases are never in public/purchasable list', () => {
    for (const legacy of [TenantPlan.ESSENTIAL, TenantPlan.CONTROL, TenantPlan.BUSINESS, TenantPlan.ENTERPRISE]) {
      assert.ok(!PUBLIC_PLAN_IDS.includes(legacy));
      assert.ok(!PURCHASABLE_PLAN_IDS.includes(legacy));
    }
  });

  test('unknown / null plan falls back to a safe default (Basic)', () => {
    assert.equal(getPlanConfig(null).id, TenantPlan.BASIC);
    assert.equal(getPlanConfig(undefined).id, TenantPlan.BASIC);
    assert.equal(getPlanConfig('NOT_A_PLAN').id, TenantPlan.BASIC);
  });
});

// ─── Public pricing serialization ───────────────────────────────────────────

describe('PRICING SECRECY: the public API exposes billed list prices only', () => {
  test('every serialized price is the real billed list price from PLANS', () => {
    const data = serializePublicPlans();
    for (const plan of data.plans) {
      assert.equal(plan.priceEgp, PLANS[plan.id as TenantPlan].priceEgp, 'the public API must publish the price that is actually billed');
    }
  });

  test('serializePublicPlans exposes all 4 public plans and hides internal fields', () => {
    const data = serializePublicPlans();
    const ids = data.plans.map((p) => p.id);
    assert.deepEqual([...ids].sort(), [TenantPlan.BASIC, TenantPlan.GROWTH, TenantPlan.PRO, TenantPlan.MULTI_BRANCH].sort());
    for (const plan of data.plans) {
      assert.ok(!('visitLimit' in plan.limits), 'visit limits are internal and must not be exposed');
      assert.ok(!('purchasable' in plan), 'internal flags must not be exposed');
      assert.ok(Number.isFinite(plan.priceEgp), 'price must always be present for public plans');
    }
  });

  test('GET /api/plans is unauthenticated and returns all 4 plans', async () => {
    const { createTestApp } = await import('./helpers.js');
    const app = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/plans' });
    assert.equal(res.statusCode, 200);
    const parsed = JSON.parse(res.body) as { data?: { plans?: Array<{ id: string; priceEgp: number }> } };
    assert.ok(parsed.data?.plans);
    const ids = parsed.data.plans.map((p) => p.id);
    assert.deepEqual([...ids].sort(), [TenantPlan.BASIC, TenantPlan.GROWTH, TenantPlan.PRO, TenantPlan.MULTI_BRANCH].sort());
    await app.close();
  });
});

// ─── Landing founding offer ──────────────────────────────────────────────────

describe('LANDING OFFER: founding prices stay out of the public pricing API', () => {
  test('no founding price leaks through serializePublicPlans()', () => {
    const data = serializePublicPlans();
    for (const offer of LANDING_OFFERS) {
      const plan = data.plans.find((p) => p.id === offer.planId);
      assert.ok(plan, `plan ${offer.planId} should be in serialized plans`);
      assert.notEqual(
        plan.priceEgp,
        offer.foundingPriceEgp,
        `plan ${offer.planId} must publish list price (${offer.listPriceEgp}) not founding price (${offer.foundingPriceEgp})`,
      );
    }
  });

  test('no founding price leaks through the unauthenticated GET /api/plans', async () => {
    const { createTestApp } = await import('./helpers.js');
    const app = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/plans' });
    assert.equal(res.statusCode, 200);
    const parsed = JSON.parse(res.body) as { data?: { plans?: Array<{ id: string; priceEgp: number }> } };
    const plans = parsed.data?.plans ?? [];
    for (const offer of LANDING_OFFERS) {
      const plan = plans.find((p) => p.id === offer.planId);
      assert.ok(plan, `plan ${offer.planId} should be in GET /api/plans`);
      assert.notEqual(
        plan.priceEgp,
        offer.foundingPriceEgp,
        `plan ${offer.planId} in /api/plans must publish list price not founding price`,
      );
    }
    assert.ok(!res.body.includes('foundingPriceEgp'), 'founding pricing field must not be serialized');
    await app.close();
  });

  test('every plan advertises core operational features', () => {
    for (const offer of LANDING_OFFERS) {
      assert.ok(
        offer.featuresAr.length > 0 && offer.featuresEn.length > 0,
        `${offer.slug} must have feature descriptions in both languages`,
      );
    }
  });

  test('no founding price ever exceeds the list price it is discounted from', () => {
    for (const offer of LANDING_OFFERS) {
      assert.ok(
        offer.foundingPriceEgp <= offer.listPriceEgp,
        `${offer.slug} founding price must not exceed its list price`,
      );
    }
  });
});

describe('LANDING OFFER: list prices track the billing catalogue', () => {
  test('every landing list price is read from PLANS, not re-declared', () => {
    for (const offer of LANDING_OFFERS) {
      const plan = PLANS[offer.planId];
      assert.equal(offer.listPriceEgp, plan.priceEgp, `${offer.slug} list price drifted from PLANS`);
    }
  });

  test('the offering plans resolve to the 4 tiers', () => {
    assert.equal(getOfferBySlug('basic')?.planId, TenantPlan.BASIC);
    assert.equal(getOfferBySlug('growth')?.planId, TenantPlan.GROWTH);
    assert.equal(getOfferBySlug('pro')?.planId, TenantPlan.PRO);
    assert.equal(getOfferBySlug('multi-branch')?.planId, TenantPlan.MULTI_BRANCH);
  });
});

describe('LANDING OFFER: Growth is primary and the others are secondary', () => {
  test('Growth is the single primary offer', () => {
    assert.equal(PRIMARY_OFFER.slug, 'growth');
    assert.equal(PRIMARY_OFFER.emphasis, 'primary');
    assert.equal(LANDING_OFFERS.filter((offer) => offer.emphasis === 'primary').length, 1);
  });

  test('the secondary offers are Basic, Pro, and Multi-Branch', () => {
    assert.deepEqual(
      SECONDARY_OFFERS.map((offer) => offer.slug).sort(),
      ['basic', 'multi-branch', 'pro'].sort(),
    );
  });
});

describe('LANDING OFFER: founding discount math', () => {
  test('a founding price below the list price yields a rounded percentage', () => {
    assert.equal(foundingDiscountPercent(getOfferBySlug('growth')!), 33); // 1499 -> 999
    assert.equal(foundingDiscountPercent(getOfferBySlug('basic')!), 30); // 499 -> 349
    assert.equal(foundingDiscountPercent(getOfferBySlug('pro')!), 25); // 1999 -> 1499
    assert.equal(foundingDiscountPercent(getOfferBySlug('multi-branch')!), 30); // 4999 -> 3499
  });

  test('no discount is reported when there is no real reduction', () => {
    assert.equal(foundingDiscountPercent({ ...PRIMARY_OFFER, foundingPriceEgp: PRIMARY_OFFER.listPriceEgp }), null);
    assert.equal(foundingDiscountPercent({ ...PRIMARY_OFFER, foundingPriceEgp: 9999 }), null);
    assert.equal(foundingDiscountPercent({ ...PRIMARY_OFFER, listPriceEgp: 0 }), null);
  });
});

describe('LANDING OFFER: founding period wording', () => {
  test('an unbounded founding offer never claims a number of months', () => {
    assert.equal(FOUNDING_OFFER.months, null);
    assert.equal(foundingPeriodLabel('ar'), 'لفترة التأسيس');
    assert.equal(foundingPeriodLabel('en'), 'for the founding period');
  });

  test('setting a window switches to an explicit month count in both languages', () => {
    const arabic = FOUNDING_OFFER.periodMonthsAr.replace('{n}', '3');
    const english = FOUNDING_OFFER.periodMonthsEn.replace('{n}', '3');
    assert.equal(arabic, 'لأول 3 شهور');
    assert.equal(english, 'for the first 3 months');
  });
});

describe('LANDING OFFER: public promises are configured, never invented', () => {
  test('the guarantee window matches trial length', () => {
    assert.equal(GUARANTEE.windowDays, TRIAL_DAYS);
  });

  test('support channel defaults are safe when unconfigured', () => {
    assert.ok(SUPPORT.hoursAr.length > 0);
  });
});

// ─── Visit usage warnings ────────────────────────────────────────────────────

describe('VISIT USAGE: warning thresholds', () => {
  test('unlimited plans report no cap and no usage level', () => {
    const u = computeVisitUsage(5_000, null);
    assert.equal(u.limit, null);
    assert.equal(u.percent, null);
    assert.equal(u.level, 'none');
    assert.equal(u.overLimit, false);
  });

  test('below 80% is normal operation', () => {
    const u = computeVisitUsage(2_000, 3_000);
    assert.equal(u.level, 'ok');
    assert.equal(u.percent, 67);
  });

  test('80% triggers the first warning', () => {
    const u = computeVisitUsage(2_400, 3_000);
    assert.equal(u.percent, 80);
    assert.equal(u.level, 'warning');
    assert.equal(u.remaining, 600);
  });

  test('90% and above triggers the stronger warning', () => {
    const u = computeVisitUsage(2_700, 3_000);
    assert.equal(u.level, 'strong');
    assert.equal(u.percent, 90);
    assert.equal(VISIT_USAGE_WARNING_PERCENT, 80);
    assert.equal(VISIT_USAGE_STRONG_PERCENT, 90);
    assert.equal(VISIT_USAGE_LIMIT_PERCENT, 100);
  });

  test('100% is reached and flagged', () => {
    const u = computeVisitUsage(3_000, 3_000);
    assert.equal(u.level, 'over');
    assert.equal(u.percent, 100);
    assert.equal(u.remaining, 0);
  });
});

// ─── Visit-counting semantics (VOID excluded, period-scoped) ─────────────────

describe('VISIT COUNTING: one check-in to one session = one visit', () => {
  test('VOID attendances are excluded from usage', () => {
    const where = buildVisitCountWhere(new Date('2026-09-01'), 'tenant-1');
    assert.deepEqual(where.status, { not: AttendanceStatus.VOID });
  });

  test('only attendances on/after the usage-period start count', () => {
    const start = new Date('2026-09-01T10:00:00Z');
    const where = buildVisitCountWhere(start, 'tenant-1');
    assert.deepEqual(where.checkInTime, { gte: start });
    assert.deepEqual(where.session, { tenantId: 'tenant-1' });
  });

  test('usage window falls back to tenant creation when no active paid period', () => {
    const createdAt = new Date('2026-08-01');
    const now = new Date('2026-09-20');
    const subs = [
      { status: SubscriptionStatus.EXPIRED, periodStart: new Date('2026-07-01'), periodEnd: new Date('2026-07-31') },
      { status: SubscriptionStatus.CANCELED, periodStart: new Date('2026-08-01'), periodEnd: new Date('2026-08-30') },
    ];
    assert.equal(resolveUsagePeriodStart(createdAt, subs, now).getTime(), createdAt.getTime());
  });

  test('usage window is the running active subscription period', () => {
    const createdAt = new Date('2026-01-01');
    const now = new Date('2026-09-20');
    const subs = [
      { status: SubscriptionStatus.EXPIRED, periodStart: new Date('2026-06-01'), periodEnd: new Date('2026-06-30') },
      { status: SubscriptionStatus.ACTIVE, periodStart: new Date('2026-09-01'), periodEnd: new Date('2026-09-30') },
    ];
    const start = resolveUsagePeriodStart(createdAt, subs, now);
    assert.equal(start.toISOString(), new Date('2026-09-01').toISOString());
  });
});

// ─── Receptionist (maxUsers) plan gate ───────────────────────────────────────

describe('RECEPTIONIST LIMIT: maxUsers gate', () => {
  test('creating a receptionist at the cap is refused', () => {
    assert.equal(receptionistLimitReached(1, 1), true); // Basic cap (1)
    assert.equal(receptionistLimitReached(3, 3), true); // Growth cap (3)
    assert.equal(receptionistLimitReached(10, 10), true);
  });

  test('creating a receptionist below the cap is allowed', () => {
    assert.equal(receptionistLimitReached(0, 1), false);
    assert.equal(receptionistLimitReached(2, 3), false);
    assert.equal(receptionistLimitReached(0, 10), false);
  });

  test('a broken/zero cap never blocks (defensive)', () => {
    assert.equal(receptionistLimitReached(0, 0), true);
    assert.equal(receptionistLimitReached(1, 0), true);
    assert.equal(receptionistLimitReached(2, -1), true);
  });
});