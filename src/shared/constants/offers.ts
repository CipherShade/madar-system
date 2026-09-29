import { PLANS, TenantPlan } from './plans.js';

export type LandingOffer = {
  planId: TenantPlan;
  slug: 'madar';
  nameAr: string;
  nameEn: string;
  badgeAr: string | null;
  badgeEn: string | null;
  highlightAr: string | null;
  highlightEn: string | null;
  taglineAr: string;
  taglineEn: string;
  listPriceEgp: number;
  foundingPriceEgp: number;
  featuresAr: string[];
  featuresEn: string[];
};

/** The only public subscription. Legacy plans remain in plans.ts for existing tenants. */
export const MADAR_OFFER: LandingOffer = {
  planId: TenantPlan.PRO,
  slug: 'madar',
  nameAr: 'مَدار',
  nameEn: 'Madar',
  badgeAr: 'النظام كامل',
  badgeEn: 'The complete system',
  highlightAr: 'السعر الحالي لفترة محدودة',
  highlightEn: 'Current price for a limited time',
  taglineAr: 'كل ما تحتاجه لإدارة السنتر من مكان واحد.',
  taglineEn: 'Everything you need to run your center, in one place.',
  listPriceEgp: 1999,
  foundingPriceEgp: PLANS[TenantPlan.PRO].priceEgp,
  featuresAr: [
    'إدارة الطلاب', 'الحضور والغياب', 'الحصص والجداول', 'الريسبشن',
    'التحصيل والمدفوعات', 'أرصدة الطلاب', 'إدارة المدرسين', 'تسويات المدرسين',
    'التقارير', 'المستخدمين والصلاحيات', 'تشغيل أكثر من مكتب استقبال', 'المتابعة اللحظية للتشغيل',
  ],
  featuresEn: [
    'Student management', 'Attendance', 'Sessions and schedules', 'Reception',
    'Collections and payments', 'Student balances', 'Teacher management', 'Teacher settlements',
    'Reports', 'Users and permissions', 'Multiple reception desks', 'Live operational visibility',
  ],
};

export const FOUNDING_OFFER = {
  enabled: true,
  badgeAr: 'السعر الحالي لفترة محدودة',
  badgeEn: 'Limited-time current price',
} as const;

export const GUARANTEE = {
  enabled: true,
  windowDays: 14,
  headlineAr: 'لو بعد أسبوعين مش شايف بوضوح إيه اللي بيحصل جوه سنترك — مين حضر، مين دفع، والمدرسين مستحقين كام — هرجعلك فلوسك كاملة.',
  headlineEn: 'If after two weeks you still cannot clearly see what is happening inside your center, you get a full refund.',
  termsUrl: null as string | null,
} as const;

export const SUPPORT = { whatsapp: null as string | null, phone: null as string | null, email: null as string | null } as const;
export const ONBOARDING_VIDEO_URL: string | null = null;

export function foundingDiscountPercent(offer: LandingOffer): number | null {
  if (!offer.listPriceEgp || offer.foundingPriceEgp >= offer.listPriceEgp) return null;
  return Math.round(((offer.listPriceEgp - offer.foundingPriceEgp) / offer.listPriceEgp) * 100);
}
