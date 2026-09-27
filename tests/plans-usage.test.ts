import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MADAR_PLANS,
  PLAN_IDS,
  getPlanConfig,
  calculateUsageWarning,
  canAddReceptionist,
  canAddBranch,
  canCheckIn,
} from '../src/shared/constants/plans.js';
import { computeBillingPeriod } from '../src/server/modules/subscriptions/usageService.js';

describe('Madar SaaS Subscription Plans Configuration', () => {
  it('defines exactly the 4 required Madar plans with exact names and specs', () => {
    assert.equal(PLAN_IDS.BASIC, 'BASIC');
    assert.equal(PLAN_IDS.GROWTH, 'GROWTH');
    assert.equal(PLAN_IDS.PRO, 'PRO');
    assert.equal(PLAN_IDS.MULTI_BRANCH, 'MULTI_BRANCH');

    // Plan 1: BASIC (499 EGP, 1 branch, 1 receptionist, 3,000 visits)
    const basic = MADAR_PLANS.BASIC;
    assert.equal(basic.name, 'Basic');
    assert.equal(basic.priceEgp, 499);
    assert.equal(basic.maxBranches, 1);
    assert.equal(basic.maxReceptionists, 1);
    assert.equal(basic.monthlyVisitLimit, 3000);

    // Plan 2: GROWTH (1,499 EGP, 1 branch, 3 receptionists, 10,000 visits)
    const growth = MADAR_PLANS.GROWTH;
    assert.equal(growth.name, 'Growth');
    assert.equal(growth.priceEgp, 1499);
    assert.equal(growth.maxBranches, 1);
    assert.equal(growth.maxReceptionists, 3);
    assert.equal(growth.monthlyVisitLimit, 10000);

    // Plan 3: PRO (1,999 EGP, 1 branch, Unlimited receptionists, 20,000 visits)
    const pro = MADAR_PLANS.PRO;
    assert.equal(pro.name, 'Pro');
    assert.equal(pro.priceEgp, 1999);
    assert.equal(pro.maxBranches, 1);
    assert.equal(pro.maxReceptionists, null); // unlimited
    assert.equal(pro.monthlyVisitLimit, 20000);

    // Plan 4: MULTI-BRANCH (4,999 EGP, Multiple branches, Unlimited receptionists, 50,000+ visits)
    const multiBranch = MADAR_PLANS.MULTI_BRANCH;
    assert.equal(multiBranch.name, 'Multi-Branch');
    assert.equal(multiBranch.priceEgp, 4999);
    assert.equal(multiBranch.maxBranches, null); // multiple / unlimited
    assert.equal(multiBranch.maxReceptionists, null); // unlimited
    assert.equal(multiBranch.monthlyVisitLimit, 50000);
  });

  it('getPlanConfig handles various casings and legacy plan mappings gracefully', () => {
    assert.equal(getPlanConfig('BASIC').id, 'BASIC');
    assert.equal(getPlanConfig('basic').id, 'BASIC');
    assert.equal(getPlanConfig('growth').id, 'GROWTH');
    assert.equal(getPlanConfig('pro').id, 'PRO');
    assert.equal(getPlanConfig('multi_branch').id, 'MULTI_BRANCH');
    assert.equal(getPlanConfig('MULTI_BRANCH').id, 'MULTI_BRANCH');

    // Legacy plan mappings
    assert.equal(getPlanConfig('BUSINESS').id, 'PRO');
    assert.equal(getPlanConfig('ENTERPRISE').id, 'MULTI_BRANCH');
    assert.equal(getPlanConfig('FREE_TRIAL').id, 'BASIC');
    assert.equal(getPlanConfig('UNKNOWN_PLAN').id, 'BASIC');
  });
});

describe('Usage Warnings & Threshold Calculation', () => {
  it('calculates normal usage below 80% with warningLevel NONE', () => {
    const res = calculateUsageWarning(1500, 3000);
    assert.equal(res.percentage, 50);
    assert.equal(res.remaining, 1500);
    assert.equal(res.isBlocked, false);
    assert.equal(res.warningLevel, 'NONE');
  });

  it('triggers 80% warning at 80% usage threshold', () => {
    const res = calculateUsageWarning(2400, 3000);
    assert.equal(res.percentage, 80);
    assert.equal(res.remaining, 600);
    assert.equal(res.isBlocked, false);
    assert.equal(res.warningLevel, 'WARNING_80');
    assert.match(res.messageAr!, /اقتربت من حد الاستخدام الشهري/);
  });

  it('triggers 90% warning at 90% usage threshold', () => {
    const res = calculateUsageWarning(2700, 3000);
    assert.equal(res.percentage, 90);
    assert.equal(res.remaining, 300);
    assert.equal(res.isBlocked, false);
    assert.equal(res.warningLevel, 'WARNING_90');
    assert.match(res.messageAr!, /تبقى لديك (300|٣٠٠) زيارة فقط/);
  });

  it('triggers LIMIT_REACHED state when usage equals or exceeds limit', () => {
    const resExact = calculateUsageWarning(3000, 3000);
    assert.equal(resExact.percentage, 100);
    assert.equal(resExact.remaining, 0);
    assert.equal(resExact.isBlocked, true);
    assert.equal(resExact.warningLevel, 'LIMIT_REACHED');
    assert.match(resExact.messageAr!, /وصلت للحد الشهري للزيارات/);

    const resOver = calculateUsageWarning(3050, 3000);
    assert.equal(resOver.percentage, 100);
    assert.equal(resOver.remaining, 0);
    assert.equal(resOver.isBlocked, true);
    assert.equal(resOver.warningLevel, 'LIMIT_REACHED');
  });
});

describe('Plan Limits Business Rules', () => {
  it('enforces receptionist limits per plan', () => {
    // Basic: max 1
    assert.equal(canAddReceptionist(0, 'BASIC'), true);
    assert.equal(canAddReceptionist(1, 'BASIC'), false);
    assert.equal(canAddReceptionist(2, 'BASIC'), false);

    // Growth: max 3
    assert.equal(canAddReceptionist(0, 'GROWTH'), true);
    assert.equal(canAddReceptionist(2, 'GROWTH'), true);
    assert.equal(canAddReceptionist(3, 'GROWTH'), false);

    // Pro: unlimited
    assert.equal(canAddReceptionist(0, 'PRO'), true);
    assert.equal(canAddReceptionist(10, 'PRO'), true);
    assert.equal(canAddReceptionist(100, 'PRO'), true);

    // Multi-Branch: unlimited
    assert.equal(canAddReceptionist(0, 'MULTI_BRANCH'), true);
    assert.equal(canAddReceptionist(50, 'MULTI_BRANCH'), true);
  });

  it('enforces branch limits per plan', () => {
    // Basic, Growth, Pro: 1 branch max
    assert.equal(canAddBranch(0, 'BASIC'), true);
    assert.equal(canAddBranch(1, 'BASIC'), false);

    assert.equal(canAddBranch(1, 'GROWTH'), false);
    assert.equal(canAddBranch(1, 'PRO'), false);

    // Multi-Branch: unlimited branches
    assert.equal(canAddBranch(1, 'MULTI_BRANCH'), true);
    assert.equal(canAddBranch(10, 'MULTI_BRANCH'), true);
  });

  it('enforces check-in monthly visit limits', () => {
    // Basic (3,000 visits)
    assert.equal(canCheckIn(2999, 'BASIC'), true);
    assert.equal(canCheckIn(3000, 'BASIC'), false);
    assert.equal(canCheckIn(3001, 'BASIC'), false);

    // Growth (10,000 visits)
    assert.equal(canCheckIn(9999, 'GROWTH'), true);
    assert.equal(canCheckIn(10000, 'GROWTH'), false);

    // Pro (20,000 visits)
    assert.equal(canCheckIn(19999, 'PRO'), true);
    assert.equal(canCheckIn(20000, 'PRO'), false);

    // Multi-Branch (50,000 visits)
    assert.equal(canCheckIn(49999, 'MULTI_BRANCH'), true);
    assert.equal(canCheckIn(50000, 'MULTI_BRANCH'), false);
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
});
