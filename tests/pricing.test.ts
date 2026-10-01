import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { MONTHLY_PRICE_EGP, SUBSCRIPTION_CURRENCY, TRIAL_DAYS } from '../src/shared/constants/subscription.js';
import { FOUNDING_OFFER, GUARANTEE, MADAR_OFFER, SUPPORT, foundingDiscountPercent } from '../src/shared/constants/offers.js';
import { serializePublicPricing } from '../src/server/modules/subscriptions/publicPricing.js';
import { buildVisitCountWhere, resolveUsagePeriodStart } from '../src/server/modules/subscriptions/subscriptions.js';
import { AttendanceStatus, SubscriptionStatus } from '../src/shared/constants/index.js';

// ─── The one product ─────────────────────────────────────────────────────────

describe('PRICING: one unlimited product', () => {
  test('there is exactly one price and it is EGP 1,199', () => {
    assert.equal(MONTHLY_PRICE_EGP, 1199);
    assert.equal(SUBSCRIPTION_CURRENCY, 'EGP');
  });

  test('the founding discount is measured against a higher list price', () => {
    assert.equal(MADAR_OFFER.listPriceEgp, 1999);
    assert.ok(MADAR_OFFER.foundingPriceEgp < MADAR_OFFER.listPriceEgp);
    assert.equal(MADAR_OFFER.foundingPriceEgp, MONTHLY_PRICE_EGP);
  });

  test('the founding price never exceeds the list price it is discounted from', () => {
    assert.ok(MADAR_OFFER.foundingPriceEgp <= MADAR_OFFER.listPriceEgp);
  });

  test('no discount is reported when there is no real reduction', () => {
    assert.equal(foundingDiscountPercent({ ...MADAR_OFFER, foundingPriceEgp: MADAR_OFFER.listPriceEgp }), null);
    assert.equal(foundingDiscountPercent({ ...MADAR_OFFER, foundingPriceEgp: 5000 }), null);
    assert.equal(foundingDiscountPercent({ ...MADAR_OFFER, listPriceEgp: 0 }), null);
  });

  test('the offer advertises features in both languages', () => {
    assert.ok(MADAR_OFFER.featuresAr.length > 0 && MADAR_OFFER.featuresEn.length > 0);
  });

  test('the landing guarantee window matches the trial length', () => {
    assert.equal(GUARANTEE.windowDays, TRIAL_DAYS);
  });

  test('unconfigured support channels are null rather than invented placeholders', () => {
    assert.equal(SUPPORT.whatsapp, null);
    assert.equal(SUPPORT.phone, null);
    assert.equal(SUPPORT.email, null);
  });

  test('the founding offer is enabled and named in both languages', () => {
    assert.equal(FOUNDING_OFFER.enabled, true);
    assert.ok(FOUNDING_OFFER.badgeAr.length > 0 && FOUNDING_OFFER.badgeEn.length > 0);
  });
});

// ─── Public pricing API ──────────────────────────────────────────────────────

describe('PRICING: GET /api/pricing publishes the real billed price', () => {
  test('the serializer reports the actual charge in the actual currency', () => {
    const data = serializePublicPricing();
    assert.equal(data.priceEgp, MONTHLY_PRICE_EGP);
    assert.equal(data.currency, 'EGP');
    assert.equal(data.trialDays, TRIAL_DAYS);
  });

  test('the serializer advertises the product as unlimited', () => {
    const { unlimited } = serializePublicPricing();
    assert.deepEqual(unlimited, {
      receptionStaff: true,
      branches: true,
      receptionDesks: true,
      studentVisits: true,
    });
  });

  test('GET /api/pricing is unauthenticated', async () => {
    const { createTestApp } = await import('./helpers.js');
    const app = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/pricing' });
    assert.equal(res.statusCode, 200);
    const parsed = JSON.parse(res.body) as { success: boolean; data?: { priceEgp?: number } };
    assert.equal(parsed.success, true);
    assert.equal(parsed.data?.priceEgp, MONTHLY_PRICE_EGP);
    await app.close();
  });
});

describe('PRICING SECRECY: the marketing anchor never reaches the public API', () => {
  test('the EGP 1,999 anchor is not what the API charges', () => {
    const data = serializePublicPricing();
    assert.notEqual(data.priceEgp, MADAR_OFFER.listPriceEgp);
    assert.equal(data.priceEgp, MADAR_OFFER.foundingPriceEgp);
  });

  test('no founding or list pricing field is serialized anywhere in the response', async () => {
    const { createTestApp } = await import('./helpers.js');
    const app = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/pricing' });
    assert.equal(res.statusCode, 200);
    assert.ok(!res.body.includes('foundingPrice'), 'founding pricing must not be serialized');
    assert.ok(!res.body.includes('listPrice'), 'the marketing anchor must not be serialized');
    assert.ok(!res.body.includes(String(MADAR_OFFER.listPriceEgp)), 'the anchor price must not appear');
    await app.close();
  });
});

describe('PRICING: the multi-tier catalogue is gone', () => {
  test('GET /api/plans is no longer registered', async () => {
    const { createTestApp } = await import('./helpers.js');
    const app = await createTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/plans' });
    assert.equal(res.statusCode, 404);
    await app.close();
  });

  test('GET /api/subscriptions/upgrade is no longer registered — renewal is the only path', async () => {
    const { createTestApp } = await import('./helpers.js');
    const app = await createTestApp();
    const res = await app.inject({ method: 'POST', url: '/api/subscriptions/upgrade', payload: {} });
    assert.equal(res.statusCode, 404);
    await app.close();
  });

  test('the publicPlans serializer module has been deleted', async () => {
    const { existsSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    assert.equal(existsSync(join(root, 'src/server/modules/subscriptions/publicPlans.ts')), false);
  });

  test('the receptionist maxUsers gate has been removed', async () => {
    const usersModule = await import('../src/server/modules/users/users.js');
    assert.equal(
      Object.keys(usersModule).includes('receptionistLimitReached'),
      false,
      'a receptionist cap is still exported',
    );
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

  test('a PENDING payment never opens the usage window — an unverified month is not a period', () => {
    const createdAt = new Date('2026-01-01');
    const now = new Date('2026-09-20');
    const subs = [
      { status: SubscriptionStatus.PENDING, periodStart: new Date('2026-09-01'), periodEnd: new Date('2026-09-30') },
    ];
    assert.equal(resolveUsagePeriodStart(createdAt, subs, now).getTime(), createdAt.getTime());
  });
});
