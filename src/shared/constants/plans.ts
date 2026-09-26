import { TenantPlan } from './index.js';

/**
 * Single source of truth for the pricing architecture.
 *
 * Public launch tiers: ESSENTIAL (499 EGP/mo) and CONTROL (1199 EGP/mo).
 * MULTI_BRANCH is NOT sold or activated yet (internal/future) — it is kept
 * out of every public surface (pricing pages, /api/plans, signup, billing).
 * Legacy plan values (GROWTH/BUSINESS/ENTERPRISE) are retained as aliases so
 * unmigrated rows behave under the new rules; the migration backfills them.
 *
 * Founding-customer pricing is NOT part of this catalogue and must never
 * change what a customer is billed. It lives in `constants/offers.ts` for the
 * marketing page only. The prices below are the real, billed list prices —
 * the public API, signup, and billing all read them from here.
 */

export type PlanLimits = {
  maxDesks: number;
  maxBranches: number;
  maxUsers: number;
  /**
   * Visits allowed per billing month; null = unlimited.
   *
   * For a PAID plan this stays advisory — it drives the warning meter only and
   * never blocks a check-in. The single exception is the unpaid tier, whose cap
   * is a hard payment gate (see UNPAID_VISIT_LIMIT / resolveUnpaidVisitGate).
   */
  visitLimit: number | null;
};

export type PlanConfig = {
  id: TenantPlan;
  nameAr: string;
  nameEn: string;
  /** Appears in public pricing / signup / /api/plans. */
  isPublic: boolean;
  /** Can be purchased/upgraded to right now. */
  purchasable: boolean;
  featured: boolean;
  priceEgp: number | null;
  taglineAr: string;
  taglineEn: string;
  featuresAr: string[];
  featuresEn: string[];
  limits: PlanLimits;
};

export const FREE_TRIAL_LIMITS: PlanLimits = { maxDesks: 1, maxBranches: 1, maxUsers: 3, visitLimit: null };
const ESSENTIAL_LIMITS: PlanLimits = { maxDesks: 2, maxBranches: 1, maxUsers: 3, visitLimit: null };
const CONTROL_LIMITS: PlanLimits = { maxDesks: 8, maxBranches: 1, maxUsers: 10, visitLimit: 10_000 };
const MULTI_BRANCH_LIMITS: PlanLimits = { maxDesks: 8, maxBranches: 3, maxUsers: 20, visitLimit: 30_000 };

/**
 * Hard cap on student check-ins for a center whose payment is NOT verified.
 *
 * This is the free-riding barrier: a plan `visitLimit` is only a warning meter,
 * so without this an unpaid center could run unlimited check-ins on its single
 * desk. Sized to let a genuine small center trial the product, not to run it.
 * It is a payment gate, not a pricing tier — verifying the subscription lifts
 * it immediately.
 */
export const UNPAID_VISIT_LIMIT = 100;

/**
 * Caps a tenant sits under while its payment is still unverified.
 *
 * `maxDesks` blocks opening a shift and `maxUsers` blocks adding a receptionist,
 * so those are hard caps. This tier must stay strictly below every purchasable
 * plan on both, or an unpaid center would hold a paid plan's limits.
 * `maxBranches` has no Branch model to measure against yet, so it is not a real
 * barrier. `visitLimit` is the only hard visit stop in the system and applies
 * solely to unpaid tenants.
 */
export const PENDING_PAYMENT_LIMITS: PlanLimits = { maxDesks: 1, maxBranches: 1, maxUsers: 2, visitLimit: UNPAID_VISIT_LIMIT };

const TRIAL_CONFIG: PlanConfig = {
  id: TenantPlan.FREE_TRIAL,
  nameAr: 'تجربة مجانية',
  nameEn: 'Free Trial',
  isPublic: false,
  purchasable: false,
  featured: false,
  priceEgp: 0,
  taglineAr: 'جرب مدار بالكامل لمدة ١٤ يومًا بدون أي دفع.',
  taglineEn: 'Try all of Madar for 14 days, free.',
  featuresAr: ['كل ميزات النظام', '14 يوم كاملة', 'بدون بطاقة بنكية'],
  featuresEn: ['All features enabled', 'Full 14 days', 'No credit card required'],
  limits: FREE_TRIAL_LIMITS,
};

const ESSENTIAL_CONFIG: PlanConfig = {
  id: TenantPlan.ESSENTIAL,
  nameAr: 'الأساس',
  nameEn: 'Essential',
  isPublic: true,
  purchasable: true,
  featured: false,
  priceEgp: 499,
  taglineAr: 'الإدارة اليومية الكاملة للاستقبال والطلاب والمدرسين والحسابات.',
  taglineEn: 'Complete daily management for reception, students, teachers and accounts.',
  featuresAr: [
    'النظام التشغيلي الكامل',
    'مكتبان للاستقبال يعملان معاً',
    'إدارة الطلاب والمدرسين والحصص',
    'خزينة الوردية وتسويات المدرسين',
    'التقارير اليومية والمالية',
  ],
  featuresEn: [
    'Full operational system',
    'Up to 2 reception desks',
    'Students, teachers & sessions management',
    'Shift cash drawer & teacher settlements',
    'Daily and financial reports',
  ],
  limits: ESSENTIAL_LIMITS,
};

const CONTROL_CONFIG: PlanConfig = {
  id: TenantPlan.CONTROL,
  nameAr: 'السيطرة',
  nameEn: 'Control',
  isPublic: true,
  purchasable: true,
  featured: true,
  priceEgp: 1199,
  taglineAr: 'السيطرة الكاملة على التشغيل والمالية للسناتر متعددة المكاتب.',
  taglineEn: 'Full control over operations and finances for multi-desk centers.',
  featuresAr: [
    'كل ميزات باقة الأساس',
    'مكاتب استقبال متزامنة غير محدودة',
    'لوحة تحكم مالية لمالك السنتر',
    'تنبيهات فوارق الكاش ومستحقات المدرسين',
    'دعم فني أولوية وتدريب الموظفين',
  ],
  featuresEn: [
    'Everything in Essential',
    'Unlimited synchronized reception desks',
    'Owner financial control dashboard',
    'Cash-variance & teacher-payout alerts',
    'Priority support and staff training',
  ],
  limits: CONTROL_LIMITS,
};

const MULTI_BRANCH_CONFIG: PlanConfig = {
  id: TenantPlan.MULTI_BRANCH,
  nameAr: 'متعدد الفروع',
  nameEn: 'Multi-Branch',
  isPublic: false,
  purchasable: false,
  featured: false,
  priceEgp: 2999,
  taglineAr: 'إدارة فروع متعددة بحساب مركزي (قريباً).',
  taglineEn: 'Manage multiple branches from one hub (coming soon).',
  featuresAr: ['كل ميزات باقة السيطرة', 'فروع متعددة بحساب مركزي', 'تقارير مالية مجمعة'],
  featuresEn: ['Everything in Control', 'Multiple branches, one account', 'Consolidated financial reporting'],
  limits: MULTI_BRANCH_LIMITS,
};

export const PLANS: Record<TenantPlan, PlanConfig> = {
  [TenantPlan.FREE_TRIAL]: TRIAL_CONFIG,
  [TenantPlan.ESSENTIAL]: ESSENTIAL_CONFIG,
  [TenantPlan.CONTROL]: CONTROL_CONFIG,
  [TenantPlan.MULTI_BRANCH]: MULTI_BRANCH_CONFIG,
  [TenantPlan.GROWTH]: ESSENTIAL_CONFIG,
  [TenantPlan.BUSINESS]: CONTROL_CONFIG,
  [TenantPlan.ENTERPRISE]: MULTI_BRANCH_CONFIG,
};

export const PUBLIC_PLAN_IDS: TenantPlan[] = [TenantPlan.ESSENTIAL, TenantPlan.CONTROL];
export const PURCHASABLE_PLAN_IDS: TenantPlan[] = [TenantPlan.ESSENTIAL, TenantPlan.CONTROL];

export const TRIAL_DAYS = 14;

export function isKnownPlan(plan: string | null | undefined): boolean {
  return plan !== null && plan !== undefined && plan in PLANS;
}

/** Resolves any stored plan value (including legacy aliases) to a concrete plan config. */
export function getPlanConfig(plan: string | null | undefined): PlanConfig {
  if (plan && plan in PLANS) return PLANS[plan as TenantPlan];
  return ESSENTIAL_CONFIG;
}

export function isPurchasablePlan(plan: string | null | undefined): boolean {
  return PURCHASABLE_PLAN_IDS.includes(plan as TenantPlan);
}

export function isPublicPlan(plan: string | null | undefined): boolean {
  return PUBLIC_PLAN_IDS.includes(plan as TenantPlan);
}

// ── Visit-usage warning thresholds (warning-only for paid plans) ──
export const VISIT_USAGE_WARNING_PERCENT = 80;
export const VISIT_USAGE_STRONG_PERCENT = 90;
export const VISIT_USAGE_LIMIT_PERCENT = 100;

export type VisitUsageLevel = 'none' | 'ok' | 'warning' | 'strong' | 'over';

export type VisitUsage = {
  /** null = this plan has no visit cap (unlimited). */
  limit: number | null;
  used: number;
  /** null when unlimited. */
  percent: number | null;
  /** null when unlimited. */
  remaining: number | null;
  level: VisitUsageLevel;
  overLimit: boolean;
};

/**
 * Shared by the API and the client so the warning thresholds can never drift.
 *
 * This reports only — it never blocks. For a paid plan exceeding the limit
 * raises a warning and check-in continues. Unpaid centers are stopped earlier
 * and separately, by resolveUnpaidVisitGate, which enforces UNPAID_VISIT_LIMIT.
 */
export function computeVisitUsage(used: number, limit: number | null | undefined): VisitUsage {
  const safeUsed = Math.max(0, Math.floor(Number.isFinite(used) ? used : 0));
  if (limit === null || limit === undefined || limit <= 0) {
    return { limit: null, used: safeUsed, percent: null, remaining: null, level: 'none', overLimit: false };
  }
  const percent = Math.round((safeUsed / limit) * 100);
  const level: VisitUsageLevel =
    safeUsed >= limit
      ? 'over'
      : percent >= VISIT_USAGE_STRONG_PERCENT
        ? 'strong'
        : percent >= VISIT_USAGE_WARNING_PERCENT
          ? 'warning'
          : 'ok';
  return {
    limit,
    used: safeUsed,
    percent,
    remaining: Math.max(0, limit - safeUsed),
    level,
    overLimit: safeUsed > limit,
  };
}