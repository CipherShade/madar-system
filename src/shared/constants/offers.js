import { MONTHLY_PRICE_EGP } from './subscription.js';
/**
 * The only subscription on sale. `listPriceEgp` is the anchor the founding
 * discount is measured against; `foundingPriceEgp` is what is actually charged
 * and must always track MONTHLY_PRICE_EGP.
 */
export const MADAR_OFFER = {
    nameAr: 'مَدار',
    nameEn: 'Madar',
    badgeAr: 'النظام كامل',
    badgeEn: 'The complete system',
    highlightAr: 'السعر الحالي لفترة محدودة',
    highlightEn: 'Current price for a limited time',
    taglineAr: 'كل ما تحتاجه لإدارة السنتر من مكان واحد.',
    taglineEn: 'Everything you need to run your center, in one place.',
    listPriceEgp: 1999,
    foundingPriceEgp: MONTHLY_PRICE_EGP,
    featuresAr: [
        'إدارة الطلاب', 'الحضور والغياب', 'الحصص والجداول', 'الريسبشن',
        'التحصيل والمدفوعات', 'أرصدة الطلاب', 'إدارة المدرسين', 'تسويات المدرسين',
        'التقارير', 'المستخدمين والصلاحيات', 'عدد غير محدود من موظفي الريسبشن', 'عدد غير محدود من الفروع',
        'عدد غير محدود من مكاتب الاستقبال', 'المتابعة اللحظية للتشغيل',
    ],
    featuresEn: [
        'Student management', 'Attendance', 'Sessions and schedules', 'Reception',
        'Collections and payments', 'Student balances', 'Teacher management', 'Teacher settlements',
        'Reports', 'Users and permissions', 'Unlimited reception staff', 'Unlimited branches',
        'Unlimited reception desks', 'Live operational visibility',
    ],
};
export const FOUNDING_OFFER = {
    enabled: true,
    badgeAr: 'السعر الحالي لفترة محدودة',
    badgeEn: 'Limited-time current price',
};
export const GUARANTEE = {
    enabled: true,
    windowDays: 14,
    headlineAr: 'لو بعد أسبوعين مش شايف بوضوح إيه اللي بيحصل جوه سنترك — مين حضر، مين دفع، والمدرسين مستحقين كام — هرجعلك فلوسك كاملة.',
    headlineEn: 'If after two weeks you still cannot clearly see what is happening inside your center, you get a full refund.',
    termsUrl: null,
};
export const SUPPORT = { whatsapp: null, phone: null, email: null };
export const ONBOARDING_VIDEO_URL = null;
export function foundingDiscountPercent(offer) {
    if (!offer.listPriceEgp || offer.foundingPriceEgp >= offer.listPriceEgp)
        return null;
    return Math.round(((offer.listPriceEgp - offer.foundingPriceEgp) / offer.listPriceEgp) * 100);
}
