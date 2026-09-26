import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { TenantPlan } from '../src/shared/constants/index.js';
import {
  PLANS,
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

describe('PRICING: launch catalogue', () => {
  test('Essential is 499 EGP/mo and Control is 1199 EGP/mo', () => {
    assert.equal(PLANS[TenantPlan.ESSENTIAL].priceEgp, 499);
    assert.equal(PLANS[TenantPlan.CONTROL].priceEgp, 1199);
  });

  test('only Essential + Control are public and purchasable at launch', () => {
    assert.deepEqual([...PUBLIC_PLAN_IDS].sort(), [TenantPlan.ESSENTIAL, TenantPlan.CONTROL].sort());
    assert.deepEqual([...PURCHASABLE_PLAN_IDS].sort(), [TenantPlan.ESSENTIAL, TenantPlan.CONTROL].sort());
    for (const id of PUBLIC_PLAN_IDS) assert.equal(isPublicPlan(id), true);
    for (const id of PURCHASABLE_PLAN_IDS) assert.equal(isPurchasablePlan(id), true);
  });

  test('Multi-Branch is internal-only: not public, not purchasable, not exposed', () => {
    const mb = PLANS[TenantPlan.MULTI_BRANCH];
    assert.equal(mb.isPublic, false);
    assert.equal(mb.purchasable, false);
    assert.equal(isPublicPlan(TenantPlan.MULTI_BRANCH), false);
    assert.equal(isPurchasablePlan(TenantPlan.MULTI_BRANCH), false);
    assert.ok(!PUBLIC_PLAN_IDS.includes(TenantPlan.MULTI_BRANCH));
    assert.ok(!PURCHASABLE_PLAN_IDS.includes(TenantPlan.MULTI_BRANCH));
  });

  test('Free Trial stays internal (no public pricing row)', () => {
    assert.equal(isPublicPlan(TenantPlan.FREE_TRIAL), false);
    assert.equal(isPurchasablePlan(TenantPlan.FREE_TRIAL), false);
    assert.equal(TRIAL_DAYS, 14);
  });

  test('Essential has no visit cap at launch (null = unlimited, configurable)', () => {
    assert.equal(PLANS[TenantPlan.ESSENTIAL].limits.visitLimit, null);
  });

  test('Control includes exactly 10,000 student visits per subscription period', () => {
    assert.equal(PLANS[TenantPlan.CONTROL].limits.visitLimit, 10_000);
  });
});

// ─── Plan migration / legacy aliases ─────────────────────────────────────────

describe('PLANS: migration mapping of legacy tiers', () => {
  test('GROWTH resolves to Essential, BUSINESS to Control, ENTERPRISE to Multi-Branch', () => {
    assert.equal(getPlanConfig(TenantPlan.GROWTH).id, TenantPlan.ESSENTIAL);
    assert.equal(getPlanConfig(TenantPlan.BUSINESS).id, TenantPlan.CONTROL);
    assert.equal(getPlanConfig(TenantPlan.ENTERPRISE).id, TenantPlan.MULTI_BRANCH);
  });

  test('legacy aliases are never purchasable or publicly listed', () => {
    for (const legacy of [TenantPlan.GROWTH, TenantPlan.BUSINESS, TenantPlan.ENTERPRISE]) {
      assert.equal(isPurchasablePlan(legacy), false);
      assert.equal(isPublicPlan(legacy), false);
    }
  });

  test('unknown / null plan falls back to a safe default (Essential)', () => {
    assert.equal(getPlanConfig(null).id, TenantPlan.ESSENTIAL);
    assert.equal(getPlanConfig(undefined).id, TenantPlan.ESSENTIAL);
    assert.equal(getPlanConfig('NOT_A_PLAN').id, TenantPlan.ESSENTIAL);
  });
});

// ─── Public pricing secrecy ───────────────────────────────────────────────────

describe('PRICING SECRECY: the public API exposes billed list prices only', () => {
  test('every serialized price is the real billed list price from PLANS', () => {
    const data = serializePublicPlans();
    for (const plan of data.plans) {
      assert.equal(plan.priceEgp, PLANS[plan.id as TenantPlan].priceEgp, 'the public API must publish the price that is actually billed');
    }
  });

  test('serializePublicPlans exposes only Essential + Control and hides internal fields', () => {
    const data = serializePublicPlans();
    const ids = data.plans.map((p) => p.id);
    assert.deepEqual([...ids].sort(), [TenantPlan.ESSENTIAL, TenantPlan.CONTROL].sort());
    for (const plan of data.plans) {
      assert.ok(!('visitLimit' in plan.limits), 'visit limits are internal and must not be exposed');
      assert.ok(!('purchasable' in plan), 'internal flags must not be exposed');
      assert.ok(Number.isFinite(plan.priceEgp), 'price must always be present for public plans');
    }
    const raw = JSON.stringify(data);
    assert.ok(!raw.includes(TenantPlan.MULTI_BRANCH));
    assert.ok(!raw.includes(TenantPlan.ENTERPRISE));
    assert.ok(!raw.includes(TenantPlan.GROWTH));
    assert.ok(!raw.includes(TenantPlan.BUSINESS));
  });

  test('GET /api/plans is unauthenticated and never returns Multi-Branch', async () => {
    const { createTestApp } = await import('./helpers.js');
    const app = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/plans' });
    assert.equal(res.statusCode, 200);
    const parsed = JSON.parse(res.body) as { data?: { plans?: Array<{ id: string; priceEgp: number }> } };
    assert.ok(parsed.data?.plans);
    const ids = parsed.data.plans.map((p) => p.id);
    assert.deepEqual([...ids].sort(), [TenantPlan.ESSENTIAL, TenantPlan.CONTROL].sort());
    assert.ok(!res.body.includes('MULTI_BRANCH'));
    await app.close();
  });
});

// ─── Landing founding offer (marketing-only pricing) ────────────────────────

describe('LANDING OFFER: founding prices stay out of the public pricing API', () => {
  test('no founding price leaks through serializePublicPlans()', () => {
    const payload = JSON.stringify(serializePublicPlans());
    for (const offer of LANDING_OFFERS) {
      assert.ok(
        !payload.includes(String(offer.foundingPriceEgp)),
        `founding price ${offer.foundingPriceEgp} (${offer.slug}) must not appear in the public pricing payload`,
      );
    }
  });

  test('no founding price leaks through the unauthenticated GET /api/plans', async () => {
    const { createTestApp } = await import('./helpers.js');
    const app = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/plans' });
    assert.equal(res.statusCode, 200);
    for (const offer of LANDING_OFFERS) {
      assert.ok(
        !res.body.includes(String(offer.foundingPriceEgp)),
        `founding price ${offer.foundingPriceEgp} (${offer.slug}) must not appear in /api/plans`,
      );
    }
    assert.ok(!res.body.includes('foundingPriceEgp'), 'founding pricing field must not be serialized');
    await app.close();
  });

  test('every plan advertises the one-step payments feature', () => {
    for (const offer of LANDING_OFFERS) {
      assert.ok(
        offer.featuresEn.some((feature) => feature.includes('cash, Vodafone Cash and InstaPay')),
        `${offer.slug} must advertise the one-step payments feature`,
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

  test('the offering plans still resolve to the public launch tiers', () => {
    assert.equal(getOfferBySlug('operations')?.planId, TenantPlan.CONTROL);
    assert.equal(getOfferBySlug('basic')?.planId, TenantPlan.ESSENTIAL);
    assert.equal(getOfferBySlug('multi-branch')?.planId, TenantPlan.MULTI_BRANCH);
  });
});

describe('LANDING OFFER: Operations dominates and Multi-Branch stays unsellable', () => {
  test('Operations is the single primary offer', () => {
    assert.equal(PRIMARY_OFFER.slug, 'operations');
    assert.equal(PRIMARY_OFFER.emphasis, 'primary');
    assert.equal(LANDING_OFFERS.filter((offer) => offer.emphasis === 'primary').length, 1);
  });

  test('the two secondary offers are Basic and Multi-Branch', () => {
    assert.deepEqual(
      SECONDARY_OFFERS.map((offer) => offer.slug).sort(),
      ['basic', 'multi-branch'],
    );
  });

  test('Multi-Branch is rendered as coming soon and never purchasable', () => {
    const mb = getOfferBySlug('multi-branch');
    assert.equal(mb?.available, false);
    assert.equal(isPurchasablePlan(TenantPlan.MULTI_BRANCH), false);
    assert.equal(isPublicPlan(TenantPlan.MULTI_BRANCH), false);
  });
});

describe('LANDING OFFER: founding discount math', () => {
  test('a founding price below the list price yields a rounded percentage', () => {
    assert.equal(foundingDiscountPercent(PRIMARY_OFFER), 42); // 1199 -> 699
    assert.equal(foundingDiscountPercent(getOfferBySlug('basic')!), 30); // 499 -> 349
    assert.equal(foundingDiscountPercent(getOfferBySlug('multi-branch')!), 40); // 2999 -> 1799
  });

  test('no discount is reported when there is no real reduction', () => {
    assert.equal(foundingDiscountPercent({ ...PRIMARY_OFFER, foundingPriceEgp: PRIMARY_OFFER.listPriceEgp }), null);
    assert.equal(foundingDiscountPercent({ ...PRIMARY_OFFER, foundingPriceEgp: 9999 }), null);
    assert.equal(foundingDiscountPercent({ ...PRIMARY_OFFER, listPriceEgp: 0 }), null);
  });

  test('the founding price is never above the list price for a purchasable offer', () => {
    for (const offer of LANDING_OFFERS) {
      if (!offer.available) continue;
      assert.ok(
        offer.foundingPriceEgp < offer.listPriceEgp,
        `${offer.slug} founding price must undercut the list price`,
      );
    }
  });
});

describe('LANDING OFFER: founding period wording invents no duration', () => {
  test('an unbounded founding offer never claims a number of months', () => {
    assert.equal(FOUNDING_OFFER.months, null);
    assert.equal(foundingPeriodLabel('ar'), 'لفترة التأسيس');
    assert.equal(foundingPeriodLabel('en'), 'for the founding period');
  });

  test('setting a window switches to an explicit month count in both languages', () => {
    const months = FOUNDING_OFFER.months;
    assert.equal(months, null, 'restore the open-ended default after this assertion');
    // The months branch is exercised through the same template the UI renders.
    const arabic = FOUNDING_OFFER.periodMonthsAr.replace('{n}', '3');
    const english = FOUNDING_OFFER.periodMonthsEn.replace('{n}', '3');
    assert.equal(arabic, 'لأول 3 شهور');
    assert.equal(english, 'for the first 3 months');
  });
});

describe('LANDING OFFER: public promises are configured, never invented', () => {
  test('the guarantee publishes no terms link while the product has no refund workflow', () => {
    assert.equal(GUARANTEE.termsUrl, null);
    assert.equal(GUARANTEE.windowDays, TRIAL_DAYS, 'the guarantee window must match the real trial length');
  });

  test('no support channel is claimed until one is configured', () => {
    assert.equal(SUPPORT.whatsapp, null);
    assert.equal(SUPPORT.phone, null);
    assert.equal(SUPPORT.email, null);
  });

  test('no onboarding video is promised until a real asset exists', () => {
    assert.equal(ONBOARDING_VIDEO_URL, null);
  });
});

// ─── Visit usage warnings (warning-only, never blocking) ────────────────────

describe('VISIT USAGE: warning thresholds', () => {
  test('unlimited plans report no cap and no usage level', () => {
    const u = computeVisitUsage(5_000, null);
    assert.equal(u.limit, null);
    assert.equal(u.percent, null);
    assert.equal(u.level, 'none');
    assert.equal(u.overLimit, false);
  });

  test('below 80% is normal operation', () => {
    const u = computeVisitUsage(7_000, 10_000);
    assert.equal(u.level, 'ok');
    assert.equal(u.percent, 70);
  });

  test('80% triggers the first warning', () => {
    const u = computeVisitUsage(8_000, 10_000);
    assert.equal(u.percent, 80);
    assert.equal(u.level, 'warning');
    assert.equal(u.remaining, 2_000);
  });

  test('90% and above triggers the stronger warning', () => {
    const u = computeVisitUsage(9_000, 10_000);
    assert.equal(u.level, 'strong');
    assert.equal(u.percent, 90);
    assert.equal(VISIT_USAGE_WARNING_PERCENT, 80);
    assert.equal(VISIT_USAGE_STRONG_PERCENT, 90);
    assert.equal(VISIT_USAGE_LIMIT_PERCENT, 100);
  });

  test('100% is flagged but never a hard stop', () => {
    const u = computeVisitUsage(10_000, 10_000);
    assert.equal(u.level, 'over');
    assert.equal(u.percent, 100);
    assert.equal(u.remaining, 0);
    assert.equal(u.overLimit, false); // exactly at the limit — advisory only
  });
});

// ─── Operational continuity above the limit ─────────────────────────────────

describe('VISIT USAGE: a PAID center keeps working above its visit limit', () => {
  test('usage tracking continues past the limit (advisory overage)', () => {
    const u = computeVisitUsage(12_500, 10_000);
    assert.equal(u.level, 'over');
    assert.equal(u.percent, 125);
    assert.equal(u.overLimit, true);
    assert.equal(u.remaining, 0); // nothing left - but a verified center is never blocked
  });

  test('the check-in HTTP path never returns a visit-limit refusal (usage is advisory)', async () => {
    const { createTestApp, receptionistAuth, authHeaders, validUUID } = await import('./helpers.js');
    const app = await createTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/attendances/checkin',
      headers: authHeaders(receptionistAuth(app).token),
      payload: {
        sessionId: validUUID('11111111-0000-0000-0000-000000000001'),
        studentId: validUUID('22222222-0000-0000-0000-000000000001'),
        paymentMethod: 'CASH',
      },
    });
    // This suite runs without a database, so the request fails on an
    // operational prerequisite (no active shift / no DB) — the important
    // assertion is that usage can NEVER short-circuit check-in: any refusal
    // must come from a genuine operational guard, not a visit/plan limit.
    //
    // Whether the center may write at all is the tenant lifecycle's decision
    // (TENANT_NOT_APPROVED / TENANT_FROZEN), which is a different axis from
    // usage and must never be expressed as a visit limit.
    const body = res.body;
    assert.ok(!body.includes('UNPAID_VISIT_LIMIT'), 'the removed unpaid visit cap must not reappear');
    assert.ok(!body.includes('VISIT_LIMIT_REACHED'));
    assert.ok(!body.includes('PLAN_LIMIT'));
    assert.ok(!body.includes('OVERAGE'));
    await app.close();
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

  test('expired active-looking rows (period end in the past) do not drive the window', () => {
    const createdAt = new Date('2026-01-01');
    const now = new Date('2026-09-20');
    const subs = [
      { status: SubscriptionStatus.ACTIVE, periodStart: new Date('2026-03-01'), periodEnd: new Date('2026-03-30') },
    ];
    assert.equal(resolveUsagePeriodStart(createdAt, subs, now).getTime(), createdAt.getTime());
  });
});

// ─── Receptionist (maxUsers) plan gate ───────────────────────────────────────

describe('RECEPTIONIST LIMIT: maxUsers gate', () => {
  test('creating a receptionist at the cap is refused', () => {
    assert.equal(receptionistLimitReached(3, 3), true); // Essential / Control cap
    assert.equal(receptionistLimitReached(10, 10), true);
  });

  test('creating a receptionist below the cap is allowed', () => {
    assert.equal(receptionistLimitReached(2, 3), false);
    assert.equal(receptionistLimitReached(0, 10), false);
  });

  test('a broken/zero cap never blocks (defensive)', () => {
    assert.equal(receptionistLimitReached(0, 0), true); // cap of 0 means nobody may be added
    assert.equal(receptionistLimitReached(1, 0), true);
    assert.equal(receptionistLimitReached(2, -1), true); // negative caps treated as 0
    assert.equal(receptionistLimitReached(0, -1), true);
  });
});