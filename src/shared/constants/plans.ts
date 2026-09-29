/**
 * Centralized Single Source of Truth for Madar SaaS Subscription Plans,
 * Plan Limits, Pricing, and Usage Configuration.
 */

export const PLAN_IDS = {
  FREE_TRIAL: 'FREE_TRIAL',
  BASIC: 'BASIC',
  GROWTH: 'GROWTH',
  PRO: 'PRO',
  MULTI_BRANCH: 'MULTI_BRANCH',
  // Legacy aliases for backward compatibility
  ESSENTIAL: 'ESSENTIAL',
  CONTROL: 'CONTROL',
  BUSINESS: 'BUSINESS',
  ENTERPRISE: 'ENTERPRISE',
} as const;

export type TenantPlan = (typeof PLAN_IDS)[keyof typeof PLAN_IDS];
export const TenantPlan = PLAN_IDS;

export type PlanLimits = {
  maxDesks: number;
  maxBranches: number | null;
  maxUsers: number | null;
  visitLimit: number | null;
};

export type PlanConfig = {
  id: TenantPlan;
  name: string;
  nameAr: string;
  nameEn: string;
  isPublic: boolean;
  purchasable: boolean;
  featured: boolean;
  priceEgp: number;
  positioningAr: string;
  positioningEn: string;
  taglineAr: string;
  taglineEn: string;
  featuresAr: string[];
  featuresEn: string[];
  limits: PlanLimits;
  monthlyVisitLimit: number | null;
  maxReceptionists: number | null;
  maxBranches: number | null;
};

export type PlanDefinition = PlanConfig;

export const TRIAL_DAYS = 14;

export const FREE_TRIAL_LIMITS: PlanLimits = {
  maxDesks: 1,
  maxBranches: 1,
  maxUsers: 1,
  visitLimit: 3000,
};

export const PENDING_PAYMENT_LIMITS: PlanLimits = {
  maxDesks: 1,
  maxBranches: 1,
  maxUsers: 1,
  visitLimit: 3000,
};

const TRIAL_CONFIG: PlanConfig = {
  id: TenantPlan.FREE_TRIAL,
  name: 'Free Trial',
  nameAr: 'تجربة مجانية',
  nameEn: 'Free Trial',
  isPublic: false,
  purchasable: false,
  featured: false,
  priceEgp: 0,
  positioningAr: 'تجربة مجانية لكافة ميزات النظام',
  positioningEn: 'Free trial of all system features',
  taglineAr: 'جرب مدار بالكامل لمدة ١٤ يومًا بدون أي دفع.',
  taglineEn: 'Try all of Madar for 14 days, free.',
  featuresAr: ['كل ميزات النظام التشغيلي', '14 يوم كاملة', 'بدون بطاقة بنكية'],
  featuresEn: ['All operational features', 'Full 14 days', 'No credit card required'],
  limits: FREE_TRIAL_LIMITS,
  monthlyVisitLimit: 3000,
  maxReceptionists: 1,
  maxBranches: 1,
};

// ─── Plan 1: BASIC (499 EGP, 1 branch, 1 receptionist, 3,000 visits) ──────────
const BASIC_CONFIG: PlanConfig = {
  id: TenantPlan.BASIC,
  name: 'Basic',
  nameAr: 'Basic',
  nameEn: 'Basic',
  isPublic: false,
  purchasable: false,
  featured: false,
  priceEgp: 499,
  positioningAr: 'للسناتر الصغيرة',
  positioningEn: 'For small educational centers',
  taglineAr: 'الإدارة اليومية الكاملة للسناتر الصغيرة ذات مكتب الاستقبال الفردي.',
  taglineEn: 'Complete daily management for small centers with 1 receptionist.',
  featuresAr: [
    'النظام التشغيلي الكامل (حصص، حضور، طلاب، مدرسين)',
    '1 حساب استقبال (Receptionist)',
    '1 فرع للسنتر (Branch)',
    '3,000 زيارة طالب شهرياً',
    'الاستقبال السريع وتسجيل الحضور المباشر',
    'خزينة الوردية وتسوية المدرسين',
    'التقارير اليومية والمالية الأساسية',
  ],
  featuresEn: [
    'Full operational system (sessions, attendance, students, teachers)',
    '1 receptionist account',
    '1 branch',
    '3,000 student visits per month',
    'Live lobby & fast check-in',
    'Shift cash drawer & teacher settlements',
    'Basic daily & financial reports',
  ],
  limits: {
    maxDesks: 1,
    maxBranches: 1,
    maxUsers: 1,
    visitLimit: 3000,
  },
  monthlyVisitLimit: 3000,
  maxReceptionists: 1,
  maxBranches: 1,
};

// ─── Plan 2: GROWTH (1,499 EGP, 1 branch, 3 receptionists, 10,000 visits) ─────
const GROWTH_CONFIG: PlanConfig = {
  id: TenantPlan.GROWTH,
  name: 'Growth',
  nameAr: 'Growth',
  nameEn: 'Growth',
  isPublic: false,
  purchasable: false,
  featured: true,
  priceEgp: 1499,
  positioningAr: 'للسناتر التي بدأت في النمو',
  positioningEn: 'For growing educational centers',
  taglineAr: 'للسناتر النامية التي تتوسع في عدد الطلاب ومكاتب الاستقبال المتزامنة.',
  taglineEn: 'For growing centers expanding student capacity and reception desks.',
  featuresAr: [
    'كل ميزات باقة Basic',
    '3 حسابات استقبال متزامنة (3 Receptionists)',
    '1 فرع للسنتر (Branch)',
    '10,000 زيارة طالب شهرياً',
    'مكاتب استقبال متعددة تعمل في نفس الوقت',
    'لوحة تحكم مالية وتقارير تفصيلية',
    'إدارة صلاحيات موظفي الاستقبال',
  ],
  featuresEn: [
    'Everything in Basic',
    '3 synchronized receptionist accounts',
    '1 branch',
    '10,000 student visits per month',
    'Multiple synchronized reception desks',
    'Financial dashboard & detailed reports',
    'Staff permissions management',
  ],
  limits: {
    maxDesks: 3,
    maxBranches: 1,
    maxUsers: 3,
    visitLimit: 10000,
  },
  monthlyVisitLimit: 10000,
  maxReceptionists: 3,
  maxBranches: 1,
};

// ─── Public Madar subscription (legacy id retained for existing records) ────────
const PRO_CONFIG: PlanConfig = {
  id: TenantPlan.PRO,
  name: 'Madar',
  nameAr: 'مَدار',
  nameEn: 'Madar',
  isPublic: true,
  purchasable: true,
  featured: true,
  priceEgp: 1199,
  positioningAr: 'النظام الكامل لإدارة السنتر',
  positioningEn: 'The complete center-management system',
  taglineAr: 'كل مَدار لإدارة التشغيل اليومي من مكان واحد.',
  taglineEn: 'All of Madar for daily operations in one place.',
  featuresAr: [
    'كل ميزات باقة Growth',
    'حسابات استقبال غير محدودة (Unlimited Receptionists)',
    '1 فرع للسنتر (Branch)',
    '20,000 زيارة طالب شهرياً',
    'تقارير متقدمة وتحليلات مالية متكاملة',
    'تنبيهات فوارق الكاش وتتبع الأداء المالي',
    'أولوية في الدعم الفني وتدريب الفريق',
  ],
  featuresEn: [
    'Everything in Growth',
    'Unlimited receptionist accounts',
    '1 branch',
    '20,000 student visits per month',
    'Advanced analytics & comprehensive financial reports',
    'Cash variance alerts & financial auditing',
    'Priority support & staff onboarding',
  ],
  limits: {
    maxDesks: 8,
    maxBranches: 1,
    maxUsers: null,
    visitLimit: 20000,
  },
  monthlyVisitLimit: 20000,
  maxReceptionists: null,
  maxBranches: 1,
};

// ─── Plan 4: MULTI-BRANCH (4,999 EGP, Multiple branches, Unlimited rec, 50,000+ visits) ──
const MULTI_BRANCH_CONFIG: PlanConfig = {
  id: TenantPlan.MULTI_BRANCH,
  name: 'Multi-Branch',
  nameAr: 'Multi-Branch',
  nameEn: 'Multi-Branch',
  isPublic: false,
  purchasable: false,
  featured: false,
  priceEgp: 4999,
  positioningAr: 'لأصحاب أكثر من فرع',
  positioningEn: 'For multi-branch centers',
  taglineAr: 'للمؤسسات والسناتر التي تدير شبكة فروع متعددة بحساب مركزي موحد.',
  taglineEn: 'For institutions running multiple branch locations from one central hub.',
  featuresAr: [
    'كل ميزات باقة Pro',
    'إدارة فروع متعددة بحساب مركزي موحد (Multi-Branch)',
    'حسابات استقبال غير محدودة على مستوى كل الفروع',
    '50,000+ زيارة طالب شهرياً',
    'لوحة تحكم مركزية لمالك المؤسسة لمتابعة كل الفروع',
    'تقارير مالية مجمعة ومقارنة بين الفروع',
    'تخصيص القاعات والموظفين لكل فرع بشكل منفصل',
  ],
  featuresEn: [
    'Everything in Pro',
    'Multi-branch management from a central hub',
    'Unlimited receptionist accounts across all branches',
    '50,000+ student visits per month',
    'Central owner dashboard for all branches',
    'Consolidated cross-branch financial reports',
    'Branch-specific rooms, sessions, and staff',
  ],
  limits: {
    maxDesks: 20,
    maxBranches: null,
    maxUsers: null,
    visitLimit: 50000,
  },
  monthlyVisitLimit: 50000,
  maxReceptionists: null,
  maxBranches: null,
};

export const MADAR_PLANS: Record<'BASIC' | 'GROWTH' | 'PRO' | 'MULTI_BRANCH', PlanConfig> = {
  BASIC: BASIC_CONFIG,
  GROWTH: GROWTH_CONFIG,
  PRO: PRO_CONFIG,
  MULTI_BRANCH: MULTI_BRANCH_CONFIG,
};

export const PLANS: Record<TenantPlan, PlanConfig> = {
  [TenantPlan.FREE_TRIAL]: TRIAL_CONFIG,
  [TenantPlan.BASIC]: BASIC_CONFIG,
  [TenantPlan.GROWTH]: GROWTH_CONFIG,
  [TenantPlan.PRO]: PRO_CONFIG,
  [TenantPlan.MULTI_BRANCH]: MULTI_BRANCH_CONFIG,
  // Backward-compatible legacy aliases
  [TenantPlan.ESSENTIAL]: BASIC_CONFIG,
  [TenantPlan.CONTROL]: GROWTH_CONFIG,
  [TenantPlan.BUSINESS]: PRO_CONFIG,
  [TenantPlan.ENTERPRISE]: MULTI_BRANCH_CONFIG,
};

export const PUBLIC_PLAN_IDS: TenantPlan[] = [
  TenantPlan.PRO,
];

export const PURCHASABLE_PLAN_IDS: TenantPlan[] = [
  TenantPlan.PRO,
];

export function isKnownPlan(plan: string | null | undefined): boolean {
  if (!plan) return false;
  const upper = plan.toUpperCase();
  return upper in PLANS || upper in PLAN_IDS;
}

export function getPlanConfig(plan: string | null | undefined): PlanConfig {
  if (!plan) return BASIC_CONFIG;
  const upper = plan.toUpperCase();

  // Specific legacy / alias string mappings
  if (upper === 'MULTI-BRANCH' || upper === 'MULTIBRANCH' || upper === 'MULTI_BRANCH' || upper === 'ENTERPRISE') {
    return MULTI_BRANCH_CONFIG;
  }
  if (upper === 'PRO' || upper === 'BUSINESS') {
    return PRO_CONFIG;
  }
  if (upper === 'GROWTH' || upper === 'CONTROL') {
    return GROWTH_CONFIG;
  }
  if (upper === 'BASIC' || upper === 'ESSENTIAL' || upper === 'FREE_TRIAL') {
    return BASIC_CONFIG;
  }

  // Exact match
  if (upper in PLANS) return PLANS[upper as TenantPlan];

  return BASIC_CONFIG;
}

export function isPurchasablePlan(plan: string | null | undefined): boolean {
  if (!plan) return false;
  const upper = plan.toUpperCase();
  return PURCHASABLE_PLAN_IDS.includes(upper as TenantPlan);
}

export function isPublicPlan(plan: string | null | undefined): boolean {
  if (!plan) return false;
  const upper = plan.toUpperCase();
  return PUBLIC_PLAN_IDS.includes(upper as TenantPlan);
}

export type WarningLevel = 'NONE' | 'WARNING_80' | 'WARNING_90' | 'LIMIT_REACHED';

export const VISIT_USAGE_WARNING_PERCENT = 80;
export const VISIT_USAGE_STRONG_PERCENT = 90;
export const VISIT_USAGE_LIMIT_PERCENT = 100;

export type VisitUsageLevel = 'none' | 'ok' | 'warning' | 'strong' | 'over';

export type VisitUsage = {
  limit: number | null;
  used: number;
  percent: number | null;
  remaining: number | null;
  level: VisitUsageLevel;
  overLimit: boolean;
};

export function computeVisitUsage(used: number, limit: number | null | undefined): VisitUsage {
  const safeUsed = Math.max(0, Math.floor(Number.isFinite(used) ? used : 0));
  if (limit === null || limit === undefined || limit <= 0) {
    return { limit: null, used: safeUsed, percent: null, remaining: null, level: 'none', overLimit: false };
  }
  const percent = Math.round((safeUsed / limit) * 100);
  const level: VisitUsageLevel =
    safeUsed >= limit ? 'over'
    : percent >= VISIT_USAGE_STRONG_PERCENT ? 'strong'
    : percent >= VISIT_USAGE_WARNING_PERCENT ? 'warning' : 'ok';
  return {
    limit,
    used: safeUsed,
    percent,
    remaining: Math.max(0, limit - safeUsed),
    level,
    overLimit: safeUsed >= limit,
  };
}

export function calculateUsageWarning(
  usedVisits: number,
  monthlyLimit: number
): {
  level: WarningLevel;
  remaining: number;
  percentage: number;
  warningLevel: WarningLevel;
  messageAr: string | null;
  messageEn: string | null;
  isBlocked: boolean;
} {
  const safeUsed = Math.max(0, Math.floor(Number.isFinite(usedVisits) ? usedVisits : 0));
  if (!monthlyLimit || monthlyLimit <= 0) {
    return {
      level: 'NONE',
      warningLevel: 'NONE',
      remaining: 0,
      percentage: 0,
      messageAr: null,
      messageEn: null,
      isBlocked: false,
    };
  }

  const percentage = Math.min(100, Math.round((safeUsed / monthlyLimit) * 100));
  const remaining = Math.max(0, monthlyLimit - safeUsed);

  if (safeUsed >= monthlyLimit) {
    return {
      level: 'LIMIT_REACHED',
      warningLevel: 'LIMIT_REACHED',
      remaining: 0,
      percentage: 100,
      messageAr: 'وصلت للحد الشهري للزيارات. قم بترقية باقتك للاستمرار في تسجيل زيارات جديدة.',
      messageEn: 'You have reached your monthly visit limit. Please upgrade your plan to continue recording new visits.',
      isBlocked: true,
    };
  }

  if (percentage >= VISIT_USAGE_STRONG_PERCENT) {
    return {
      level: 'WARNING_90',
      warningLevel: 'WARNING_90',
      remaining,
      percentage,
      messageAr: `تبقى لديك ${remaining.toLocaleString('ar-EG')} زيارة فقط هذا الشهر.`,
      messageEn: `You only have ${remaining} visits remaining this month.`,
      isBlocked: false,
    };
  }

  if (percentage >= VISIT_USAGE_WARNING_PERCENT) {
    return {
      level: 'WARNING_80',
      warningLevel: 'WARNING_80',
      remaining,
      percentage,
      messageAr: `اقتربت من حد الاستخدام الشهري. استخدمت ${safeUsed.toLocaleString('ar-EG')} من ${monthlyLimit.toLocaleString('ar-EG')} زيارة. لديك ${remaining.toLocaleString('ar-EG')} زيارة متبقية هذا الشهر.`,
      messageEn: `Approaching monthly limit. You used ${safeUsed} of ${monthlyLimit} visits. You have ${remaining} visits remaining this month.`,
      isBlocked: false,
    };
  }

  return {
    level: 'NONE',
    warningLevel: 'NONE',
    remaining,
    percentage,
    messageAr: null,
    messageEn: null,
    isBlocked: false,
  };
}

export function canAddReceptionist(currentActiveCount: number, planKey?: string | null): boolean {
  const config = getPlanConfig(planKey);
  if (config.maxReceptionists === null) return true; // Unlimited
  return currentActiveCount < config.maxReceptionists;
}

export function canAddBranch(currentBranchCount: number, planKey?: string | null): boolean {
  const config = getPlanConfig(planKey);
  if (config.maxBranches === null) return true; // Multiple / Unlimited
  return currentBranchCount < config.maxBranches;
}

export function canCheckIn(currentMonthlyVisits: number, planKey?: string | null): boolean {
  const config = getPlanConfig(planKey);
  if (config.monthlyVisitLimit === null) return true;
  return currentMonthlyVisits < config.monthlyVisitLimit;
}
