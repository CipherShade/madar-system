import { PLANS } from './plans.js';
import { TENANT_PLANS, TenantPlan } from './index.js';

/**
 * Landing-page offer configuration — the single source of truth for what the
 * public marketing page is allowed to say.
 *
 * Rules enforced by this module:
 *  1. List prices are NEVER re-declared here. They are read from `PLANS` so the
 *     landing page can never drift from the billing / `/api/plans` catalogue.
 *  2. Founding prices live only here. They are deliberately NOT part of
 *     `PlanConfig`, so `serializePublicPlans()` (see server/modules/subscriptions)
 *     cannot leak them into the public pricing API.
 *  3. Any commercial promise shown publicly (founding window, guarantee,
 *     support channel) is a named constant here, so it can be configured or
 *     removed in exactly one place.
 *
 * Editing guide:
 *  - To change founding pricing → `FOUNDING_PRICE_EGP` / the per-plan values below.
 *  - To bound the founding offer → set `FOUNDING_OFFER.months` (null = open-ended
 *    "لفترة التأسيس" wording, which is the safe default; no duration is invented).
 *  - To publish refund terms → set `GUARANTEE.termsUrl`. While it is `null` the
 *    page shows the guarantee headline WITHOUT a terms link, and no refund
 *    workflow is implied because none exists in the product.
 */

/** Plan ids that may appear on the marketing page. */
export type OfferPlanId =
  | typeof TENANT_PLANS.ESSENTIAL
  | typeof TENANT_PLANS.CONTROL
  | typeof TENANT_PLANS.MULTI_BRANCH;

export type OfferEmphasis = 'primary' | 'secondary';

export type LandingOffer = {
  planId: OfferPlanId;
  /** Stable marketing slug (used for anchors and test selectors). */
  slug: 'basic' | 'operations' | 'multi-branch';
  nameAr: string;
  nameEn: string;
  /** Short label rendered beside the plan name, e.g. "الأساسية" / "الأكثر استخداماً". */
  badgeAr: string | null;
  badgeEn: string | null;
  /** One-line selling point under the tagline, e.g. "قيمة مقابل سعر". */
  highlightAr: string | null;
  highlightEn: string | null;
  /** One-line positioning shown under the plan name. */
  taglineAr: string;
  taglineEn: string;
  /**
   * Standard monthly price, read from `PLANS`. Shown struck-through next to the
   * founding price so the reader can see what the founding offer is worth.
   */
  listPriceEgp: number;
  /** Founding price actually charged today. */
  foundingPriceEgp: number;
  /**
   * Operations is the product's primary offer and must dominate the page.
   * Everything else is deliberately secondary.
   */
  emphasis: OfferEmphasis;
  /** false = not purchasable yet; the card renders as "coming soon". */
  available: boolean;
  /** Bullets describing operational control, in the visitor's language. */
  featuresAr: string[];
  featuresEn: string[];
};

// ── Founding offer window ────────────────────────────────────────────────────

/**
 * How long the founding price runs.
 *
 * `null` → the page says "لفرة التأسيس" / "for the founding period" and makes no
 * duration claim. Set a positive integer to switch the copy to
 * "لأول {n} شهور" / "for the first {n} months".
 *
 * No duration is invented here on purpose: an unbounded founding price is the
 * safe, honest default until the business decides a window.
 */
export const FOUNDING_OFFER = {
  enabled: true,
  months: null as number | null,
  /** Badge shown on the Operations card. */
  badgeAr: 'سعر التأسيس الحالي',
  badgeEn: 'Current founding price',
  /** Fallback wording when `months` is null. */
  periodAr: 'لفترة التأسيس',
  periodEn: 'for the founding period',
  /** Filler for the `months` variant, {n} is substituted. */
  periodMonthsAr: 'لأول {n} شهور',
  periodMonthsEn: 'for the first {n} months',
} as const;

export function foundingPeriodLabel(locale: 'ar' | 'en'): string {
  const months = FOUNDING_OFFER.months;
  if (months === null) return locale === 'ar' ? FOUNDING_OFFER.periodAr : FOUNDING_OFFER.periodEn;
  const template = locale === 'ar' ? FOUNDING_OFFER.periodMonthsAr : FOUNDING_OFFER.periodMonthsEn;
  return template.replace('{n}', String(months));
}

// ── Offers ───────────────────────────────────────────────────────────────────

/**
 * Display order is intentional: Operations first (the main offer), then the
 * two secondary plans.
 */
export const LANDING_OFFERS: LandingOffer[] = [
  {
    planId: TenantPlan.CONTROL,
    slug: 'operations',
    nameAr: 'الباقة التانية',
    nameEn: 'Plan Two',
    badgeAr: 'الأكثر استخداماً',
    badgeEn: 'Most popular',
    highlightAr: 'قيمة مقابل سعر',
    highlightEn: 'Value for money',
    taglineAr: 'تحكم كامل في تشغيل السنتر — للحصص والحضور والمدرسين والخزينة.',
    taglineEn: 'Full operational control — sessions, attendance, teachers and the cash drawer.',
    listPriceEgp: PLANS[TenantPlan.CONTROL].priceEgp ?? 0,
    foundingPriceEgp: 699,
    emphasis: 'primary',
    available: true,
    featuresAr: [
      'لوبي حي: الحصص النشطة، اللي هتبدأ قريباً، والمدرسين والقاعات',
      'Check-in سريع للطلاب مع منع تكرار التسجيل في نفس الحصة',
      'الحضور متسجل أوتوماتيك لكل حصة ومطابق بعدد القاعة',
      'المدفوعات: كاش، فودافون كاش، وإنستاباي في خطوة واحدة',
      'تسوية المدرسين تلقائياً من الحضور الفعلي',
      'تقارير يومية ومالية بضغطة زر',
      '٨ مكاتب استقبال شغالة في نفس الوقت',
      'رؤية تشغيلية كاملة للمالك من أي جهاز',
    ],
    featuresEn: [
      'Live lobby: active sessions, upcoming sessions, teachers and rooms',
      'Fast student check-in with duplicate protection per session',
      'Attendance captured automatically for every session',
      'Payments in one step: cash, Vodafone Cash and InstaPay',
      'Teacher settlements computed from reconciled headcount',
      'One-click daily and financial reports',
      'Up to 8 reception desks working at the same time',
      'Full owner-level operational visibility from any device',
    ],
  },
  {
    planId: TenantPlan.ESSENTIAL,
    slug: 'basic',
    nameAr: 'الباقة الأولى',
    nameEn: 'Plan One',
    badgeAr: 'الأساسية',
    badgeEn: 'Essential',
    highlightAr: null,
    highlightEn: null,
    taglineAr: 'للسنترة الصغيرة اللي ليها مكتب استقبال واحد أو اتنين.',
    taglineEn: 'For smaller centers running one or two reception desks.',
    listPriceEgp: PLANS[TenantPlan.ESSENTIAL].priceEgp ?? 0,
    foundingPriceEgp: 349,
    emphasis: 'secondary',
    available: true,
    featuresAr: [
      'النظام التشغيلي الكامل: طلاب، مدرسين، حصص وحضور',
      'لحد مكتبين للاستقبال في نفس الوقت',
      'المدفوعات: كاش، فودافون كاش، وإنستاباي في خطوة واحدة',
      'خزينة الوردية وتسوية المدرسين',
      'التقارير اليومية والمالية',
    ],
    featuresEn: [
      'Full operational system: students, teachers, sessions, attendance',
      'Up to 2 reception desks at the same time',
      'Payments in one step: cash, Vodafone Cash and InstaPay',
      'Shift cash drawer and teacher settlements',
      'Daily and financial reports',
    ],
  },
  {
    planId: TenantPlan.MULTI_BRANCH,
    slug: 'multi-branch',
    nameAr: 'الباقة التالتة',
    nameEn: 'Plan Three',
    badgeAr: null,
    badgeEn: null,
    highlightAr: null,
    highlightEn: null,
    taglineAr: 'للسنترة اللي بتشتغل أكتر من فرع بحساب مركزي واحد.',
    taglineEn: 'For centers running more than one branch from a single account.',
    listPriceEgp: PLANS[TenantPlan.MULTI_BRANCH].priceEgp ?? 0,
    foundingPriceEgp: 1799,
    emphasis: 'secondary',
    available: false,
    featuresAr: [
      'كل ميزات الباقة التانية',
      'أكثر من فرع بحساب مركزي واحد',
      'المدفوعات: كاش، فودافون كاش، وإنستاباي في خطوة واحدة',
      'تقارير مالية مجمعة على مستوى كل الفروع',
    ],
    featuresEn: [
      'Everything in Plan Two',
      'Multiple branches from a single account',
      'Payments in one step: cash, Vodafone Cash and InstaPay',
      'Consolidated reporting across all branches',
    ],
  },
];

// ── Commercial promises shown publicly ──────────────────────────────────────

/**
 * The founding-window guarantee.
 *
 * `termsUrl` is intentionally `null`: the product has no refund workflow, so
 * publishing a terms link would imply a process that does not exist. Set it to
 * a real policy URL to surface the link. The headline is display-only copy.
 */
export const GUARANTEE = {
  enabled: true,
  /** Trial/evaluation window in days that the guarantee is written against. */
  windowDays: 14,
  headlineAr:
    'لو بعد أسبوعين مش شايف بوضوح إيه اللي بيحصل جوه سنترك — مين حضر، مين دفع، والمدرسين مستحقين كام — هرجعلك فلوسك كاملة.',
  headlineEn:
    'If after two weeks you still cannot clearly see what is happening inside your center — who attended, who paid, and what teachers are owed — you get a full refund.',
  termsUrl: null as string | null,
} as const;

/**
 * Direct-support channel for the value stack.
 *
 * No support number is configured in this project yet, so every channel is
 * `null` and the UI shows a neutral "configure a channel" state instead of
 * inventing a phone number.
 */
export const SUPPORT = {
  whatsapp: null as string | null,
  phone: null as string | null,
  email: null as string | null,
  hoursAr: 'من السبت للخميس، ١٠ص لـ ١٠م',
  hoursEn: 'Saturday to Thursday, 10am to 10pm',
} as const;

/** Optional onboarding video. Null → the value-stack item is shown as text only. */
export const ONBOARDING_VIDEO_URL: string | null = null;

export const PRIMARY_OFFER: LandingOffer = LANDING_OFFERS.find((offer) => offer.emphasis === 'primary') ?? LANDING_OFFERS[0];

export const SECONDARY_OFFERS: LandingOffer[] = LANDING_OFFERS.filter((offer) => offer.emphasis === 'secondary');

export function getOfferBySlug(slug: LandingOffer['slug']): LandingOffer | undefined {
  return LANDING_OFFERS.find((offer) => offer.slug === slug);
}

/** Percentage saved by the founding price, rounded to a whole number. */
export function foundingDiscountPercent(offer: LandingOffer): number | null {
  if (!offer.listPriceEgp || offer.foundingPriceEgp >= offer.listPriceEgp) return null;
  return Math.round(((offer.listPriceEgp - offer.foundingPriceEgp) / offer.listPriceEgp) * 100);
}
