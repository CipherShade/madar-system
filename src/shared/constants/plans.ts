/**
 * Centralized Plan Configuration & Usage Rules for Madar SaaS
 * Single source of truth for all plan definitions, pricing, limits, and helper calculations.
 */

export const PLAN_IDS = {
  BASIC: 'BASIC',
  GROWTH: 'GROWTH',
  PRO: 'PRO',
  MULTI_BRANCH: 'MULTI_BRANCH',
  // Backward compatibility alias keys if encountered in legacy databases
  FREE_TRIAL: 'FREE_TRIAL',
  BUSINESS: 'BUSINESS',
  ENTERPRISE: 'ENTERPRISE',
} as const;

export type PlanId = (typeof PLAN_IDS)[keyof typeof PLAN_IDS];

export interface PlanDefinition {
  id: PlanId;
  name: string;
  nameAr: string;
  priceEgp: number;
  monthlyVisitLimit: number;
  maxReceptionists: number | null; // null = unlimited
  maxBranches: number | null;      // null = multiple / unlimited
  positioningAr: string;
  positioningEn: string;
  badgeAr?: string;
  badgeEn?: string;
  isPopular?: boolean;
  highlightColor?: string;
  featuresAr: string[];
  featuresEn: string[];
  featureBreakdown: {
    operations: {
      students: boolean | string;
      teachers: boolean | string;
      sessions: boolean | string;
      checkIn: boolean | string;
      liveLobby: boolean | string;
      payments: boolean | string;
      teacherSettlements: boolean | string;
    };
    capacity: {
      monthlyVisits: number | string;
      receptionists: number | string;
      branches: number | string;
    };
    management: {
      reports: boolean | string;
      advancedReports: boolean | string;
      analytics: boolean | string;
      permissions: boolean | string;
    };
    multiBranch: {
      multiBranchSupport: boolean | string;
      crossBranchManagement: boolean | string;
      centralDashboard: boolean | string;
    };
  };
}

export const MADAR_PLANS: Record<'BASIC' | 'GROWTH' | 'PRO' | 'MULTI_BRANCH', PlanDefinition> = {
  BASIC: {
    id: 'BASIC',
    name: 'Basic',
    nameAr: 'بيسك',
    priceEgp: 499,
    monthlyVisitLimit: 3000,
    maxReceptionists: 1,
    maxBranches: 1,
    positioningAr: 'للسناتر الصغيرة',
    positioningEn: 'For small educational centers',
    featuresAr: [
      'فرع واحد',
      'حساب استقبال واحد',
      'حتى 3,000 زيارة طالب شهرياً',
      'نظام الاستقبال والـ POS السريع',
      'إدارة الطلاب والمدرسين والحصص',
      'تصفية المدرسين وخزينة الوردية',
      'التقارير اليومية والمالية الأساسية',
    ],
    featuresEn: [
      '1 branch',
      '1 receptionist account',
      'Up to 3,000 student visits per month',
      'Fast lobby check-in & POS',
      'Student, teacher & session management',
      'Shift cash register & teacher settlements',
      'Daily & basic financial reports',
    ],
    featureBreakdown: {
      operations: {
        students: true,
        teachers: true,
        sessions: true,
        checkIn: true,
        liveLobby: true,
        payments: true,
        teacherSettlements: true,
      },
      capacity: {
        monthlyVisits: '3,000',
        receptionists: '1',
        branches: '1',
      },
      management: {
        reports: true,
        advancedReports: false,
        analytics: 'أساسية',
        permissions: 'أساسية',
      },
      multiBranch: {
        multiBranchSupport: false,
        crossBranchManagement: false,
        centralDashboard: false,
      },
    },
  },
  GROWTH: {
    id: 'GROWTH',
    name: 'Growth',
    nameAr: 'جروث',
    priceEgp: 1499,
    monthlyVisitLimit: 10000,
    maxReceptionists: 3,
    maxBranches: 1,
    positioningAr: 'للسناتر التي بدأت في النمو',
    positioningEn: 'For growing centers',
    badgeAr: 'الأكثر شيوعاً',
    badgeEn: 'Most Popular',
    isPopular: true,
    highlightColor: '#0e7c56',
    featuresAr: [
      'فرع واحد',
      '3 حسابات استقبال متزامنة',
      'حتى 10,000 زيارة طالب شهرياً',
      'كل ميزات باقة Basic',
      'تقارير تفصيلية وتصدير البيانات',
      'تحليلات حضور وإيرادات متقدمة',
      'دعم فني سريع',
    ],
    featuresEn: [
      '1 branch',
      '3 concurrent receptionist accounts',
      'Up to 10,000 student visits per month',
      'All Basic plan features',
      'Detailed reports & data export',
      'Advanced attendance & revenue analytics',
      'Priority technical support',
    ],
    featureBreakdown: {
      operations: {
        students: true,
        teachers: true,
        sessions: true,
        checkIn: true,
        liveLobby: true,
        payments: true,
        teacherSettlements: true,
      },
      capacity: {
        monthlyVisits: '10,000',
        receptionists: '3',
        branches: '1',
      },
      management: {
        reports: true,
        advancedReports: true,
        analytics: 'متقدمة',
        permissions: 'متعددة الأدوار',
      },
      multiBranch: {
        multiBranchSupport: false,
        crossBranchManagement: false,
        centralDashboard: false,
      },
    },
  },
  PRO: {
    id: 'PRO',
    name: 'Pro',
    nameAr: 'برو',
    priceEgp: 1999,
    monthlyVisitLimit: 20000,
    maxReceptionists: null, // Unlimited
    maxBranches: 1,
    positioningAr: 'للسناتر ذات التشغيل العالي',
    positioningEn: 'For high-capacity centers',
    featuresAr: [
      'فرع واحد',
      'حسابات استقبال غير محدودة',
      'حتى 20,000 زيارة طالب شهرياً',
      'كل ميزات باقة Growth',
      'أعلى كفاءة تشغيل ومزامنة فورية',
      'إدارة صلاحيات موظفين متقدمة',
      'تدريب طاقم العمل ومتابعة دورية',
    ],
    featuresEn: [
      '1 branch',
      'Unlimited receptionist accounts',
      'Up to 20,000 student visits per month',
      'All Growth plan features',
      'High-throughput real-time sync',
      'Advanced staff permissions management',
      'Staff onboarding & dedicated support',
    ],
    featureBreakdown: {
      operations: {
        students: true,
        teachers: true,
        sessions: true,
        checkIn: true,
        liveLobby: true,
        payments: true,
        teacherSettlements: true,
      },
      capacity: {
        monthlyVisits: '20,000',
        receptionists: 'غير محدود',
        branches: '1',
      },
      management: {
        reports: true,
        advancedReports: true,
        analytics: 'شاملة وتفصيلية',
        permissions: 'متقدمة ومخصصة',
      },
      multiBranch: {
        multiBranchSupport: false,
        crossBranchManagement: false,
        centralDashboard: false,
      },
    },
  },
  MULTI_BRANCH: {
    id: 'MULTI_BRANCH',
    name: 'Multi-Branch',
    nameAr: 'متعدد الفروع',
    priceEgp: 4999,
    monthlyVisitLimit: 50000,
    maxReceptionists: null, // Unlimited
    maxBranches: null,      // Unlimited branches
    positioningAr: 'لأصحاب أكثر من فرع',
    positioningEn: 'For multi-branch centers',
    badgeAr: 'للمؤسسات والشبكات',
    badgeEn: 'Enterprise Network',
    highlightColor: '#1e3a8a',
    featuresAr: [
      'فروع متعددة غير محدودة',
      'حسابات استقبال غير محدودة',
      '50,000+ زيارة طالب شهرياً',
      'لوحة قيادة مركزية لجميع الفروع',
      'إدارة موظفين وقاعات وحصص خاصة بكل فرع',
      'تقارير مجمعة ومقارنة بين الفروع',
      'مدير حساب مخصص ودعم هاتفي 24/7',
    ],
    featuresEn: [
      'Unlimited multiple branches',
      'Unlimited receptionist accounts',
      '50,000+ student visits per month',
      'Centralized multi-branch dashboard',
      'Branch-specific staff, rooms & schedules',
      'Consolidated cross-branch reporting & comparison',
      'Dedicated account manager & 24/7 support',
    ],
    featureBreakdown: {
      operations: {
        students: true,
        teachers: true,
        sessions: true,
        checkIn: true,
        liveLobby: true,
        payments: true,
        teacherSettlements: true,
      },
      capacity: {
        monthlyVisits: '50,000+',
        receptionists: 'غير محدود',
        branches: 'متعدد الفروع',
      },
      management: {
        reports: true,
        advancedReports: true,
        analytics: 'مركزية ومقارنة فروع',
        permissions: 'تحكم على مستوى الفروع',
      },
      multiBranch: {
        multiBranchSupport: true,
        crossBranchManagement: true,
        centralDashboard: true,
      },
    },
  },
};

/**
 * Maps any raw database plan key (including legacy/trial values) to its official PlanDefinition.
 */
export function getPlanConfig(planKey?: string | null): PlanDefinition {
  if (!planKey) return MADAR_PLANS.BASIC;
  const key = planKey.toUpperCase();
  if (key in MADAR_PLANS) {
    return MADAR_PLANS[key as keyof typeof MADAR_PLANS];
  }
  // Legacy / fallback mappings
  if (key === 'BUSINESS' || key === 'PRO') return MADAR_PLANS.PRO;
  if (key === 'ENTERPRISE' || key === 'MULTI_BRANCH') return MADAR_PLANS.MULTI_BRANCH;
  if (key === 'GROWTH') return MADAR_PLANS.GROWTH;
  return MADAR_PLANS.BASIC;
}

export type WarningLevel = 'NONE' | 'WARNING_80' | 'WARNING_90' | 'LIMIT_REACHED';

export interface UsageCalculationResult {
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
  warningLevel: WarningLevel;
  messageAr: string | null;
  messageEn: string | null;
  isBlocked: boolean;
}

/**
 * Calculates visit usage progress, remaining visits, warning levels, and localized messages.
 */
export function calculateUsageWarning(usedVisits: number, monthlyLimit: number): UsageCalculationResult {
  const safeUsed = Math.max(0, usedVisits);
  const safeLimit = Math.max(1, monthlyLimit);
  const remaining = Math.max(0, safeLimit - safeUsed);
  const percentage = Math.min(100, Math.round((safeUsed / safeLimit) * 100));

  let warningLevel: WarningLevel = 'NONE';
  let messageAr: string | null = null;
  let messageEn: string | null = null;
  let isBlocked = false;

  if (safeUsed >= safeLimit) {
    warningLevel = 'LIMIT_REACHED';
    isBlocked = true;
    messageAr = `وصلت للحد الشهري للزيارات (${safeUsed.toLocaleString('ar-EG')} / ${safeLimit.toLocaleString('ar-EG')}). قم بترقية باقتك للاستمرار في تسجيل زيارات جديدة.`;
    messageEn = `You have reached your monthly visit limit (${safeUsed.toLocaleString('en-US')} / ${safeLimit.toLocaleString('en-US')}). Please upgrade your plan to continue recording new visits.`;
  } else if (percentage >= 90) {
    warningLevel = 'WARNING_90';
    messageAr = `تنبيه: تبقى لديك ${remaining.toLocaleString('ar-EG')} زيارة فقط هذا الشهر (${percentage}٪ مستخدم).`;
    messageEn = `Warning: You have only ${remaining.toLocaleString('en-US')} visits remaining this month (${percentage}% used).`;
  } else if (percentage >= 80) {
    warningLevel = 'WARNING_80';
    messageAr = `اقتربت من حد الاستخدام الشهري: استخدمت ${safeUsed.toLocaleString('ar-EG')} من ${safeLimit.toLocaleString('ar-EG')} زيارة. لديك ${remaining.toLocaleString('ar-EG')} زيارة متبقية هذا الشهر.`;
    messageEn = `Approaching monthly visit limit: Used ${safeUsed.toLocaleString('en-US')} of ${safeLimit.toLocaleString('en-US')} visits. You have ${remaining.toLocaleString('en-US')} visits remaining.`;
  }

  return {
    used: safeUsed,
    limit: safeLimit,
    remaining,
    percentage,
    warningLevel,
    messageAr,
    messageEn,
    isBlocked,
  };
}

/**
 * Checks if a tenant can add another active receptionist under their plan.
 */
export function canAddReceptionist(currentActiveCount: number, planKey?: string | null): boolean {
  const config = getPlanConfig(planKey);
  if (config.maxReceptionists === null) return true; // unlimited
  return currentActiveCount < config.maxReceptionists;
}

/**
 * Checks if a tenant can add another branch under their plan.
 */
export function canAddBranch(currentBranchCount: number, planKey?: string | null): boolean {
  const config = getPlanConfig(planKey);
  if (config.maxBranches === null) return true; // multiple branches allowed
  return currentBranchCount < config.maxBranches;
}

/**
 * Checks if a tenant can record a new student check-in visit under their monthly limit.
 */
export function canCheckIn(currentMonthlyVisits: number, planKey?: string | null): boolean {
  const config = getPlanConfig(planKey);
  return currentMonthlyVisits < config.monthlyVisitLimit;
}
