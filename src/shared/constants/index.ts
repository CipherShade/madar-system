export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  RECEPTIONIST: 'RECEPTIONIST',
} as const;
export const Role = ROLES;
export type Role = (typeof ROLES)[keyof typeof ROLES];

export const TENANT_PLANS = {
  FREE_TRIAL: 'FREE_TRIAL',
  BASIC: 'BASIC',
  GROWTH: 'GROWTH',
  PRO: 'PRO',
  MULTI_BRANCH: 'MULTI_BRANCH',
  BUSINESS: 'BUSINESS',
  ENTERPRISE: 'ENTERPRISE',
  ESSENTIAL: 'ESSENTIAL',
  CONTROL: 'CONTROL',
} as const;
export const TenantPlan = TENANT_PLANS;
export type TenantPlan = (typeof TENANT_PLANS)[keyof typeof TENANT_PLANS];

export * from './plans.js';

export const SUBSCRIPTION_STATUSES = {
  PENDING: 'PENDING',
  TRIALING: 'TRIALING',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  CANCELED: 'CANCELED',
  EXPIRED: 'EXPIRED',
} as const;
export const SubscriptionStatus = SUBSCRIPTION_STATUSES;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[keyof typeof SUBSCRIPTION_STATUSES];

export const PAYMENT_METHODS = {
  CASH: 'CASH',
  VODAFONE_CASH: 'VODAFONE_CASH',
  INSTAPAY: 'INSTAPAY',
} as const;
export const PaymentMethod = PAYMENT_METHODS;
export type PaymentMethod = (typeof PAYMENT_METHODS)[keyof typeof PAYMENT_METHODS];

export const PAYMENT_METHOD_LABELS_AR: Record<PaymentMethod, string> = {
  CASH: 'كاش (نقدي)',
  VODAFONE_CASH: 'فودافون كاش / محفظة',
  INSTAPAY: 'إنستاباي (تحويل بنكي)',
};

export const SESSION_STATUSES = {
  SCHEDULED: 'SCHEDULED',
  ACTIVE: 'ACTIVE',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;
export const SessionStatus = SESSION_STATUSES;
export type SessionStatus = (typeof SESSION_STATUSES)[keyof typeof SESSION_STATUSES];

export const SESSION_STATUS_LABELS_AR: Record<SessionStatus, string> = {
  SCHEDULED: 'مجدولة قريباً',
  ACTIVE: 'جارية الآن',
  COMPLETED: 'منتهية ومقفلة',
  CANCELLED: 'ملغاة',
};

export const SHIFT_STATUSES = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;
export const ShiftStatus = SHIFT_STATUSES;
export type ShiftStatus = (typeof SHIFT_STATUSES)[keyof typeof SHIFT_STATUSES];

export const ATTENDANCE_STATUSES = {
  PAID: 'PAID',
  PARTIAL: 'PARTIAL',
  EXCUSED: 'EXCUSED',
  VOID: 'VOID',
} as const;
export const AttendanceStatus = ATTENDANCE_STATUSES;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[keyof typeof ATTENDANCE_STATUSES];

export const SETTLEMENT_STATUSES = {
  PENDING: 'PENDING',
  DISBURSED: 'DISBURSED',
} as const;
export const SettlementStatus = SETTLEMENT_STATUSES;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[keyof typeof SETTLEMENT_STATUSES];

export const SCHOOL_TYPES = {
  GENERAL: 'GENERAL',
  LANGUAGES: 'LANGUAGES',
  AZHAR: 'AZHAR',
} as const;
export const SchoolType = SCHOOL_TYPES;
export type SchoolType = (typeof SCHOOL_TYPES)[keyof typeof SCHOOL_TYPES];

export const ACADEMIC_STAGES = [
  { id: 'PRIMARY_1', labelAr: 'الأول الابتدائي', stage: 'PRIMARY' },
  { id: 'PRIMARY_2', labelAr: 'الثاني الابتدائي', stage: 'PRIMARY' },
  { id: 'PRIMARY_3', labelAr: 'الثالث الابتدائي', stage: 'PRIMARY' },
  { id: 'PRIMARY_4', labelAr: 'الرابع الابتدائي', stage: 'PRIMARY' },
  { id: 'PRIMARY_5', labelAr: 'الخامس الابتدائي', stage: 'PRIMARY' },
  { id: 'PRIMARY_6', labelAr: 'السادس الابتدائي', stage: 'PRIMARY' },
  { id: 'PREP_1', labelAr: 'الأول الإعدادي', stage: 'PREPARATORY' },
  { id: 'PREP_2', labelAr: 'الثاني الإعدادي', stage: 'PREPARATORY' },
  { id: 'PREP_3', labelAr: 'الثالث الإعدادي', stage: 'PREPARATORY' },
  { id: 'SEC_1', labelAr: 'الأول الثانوي', stage: 'SECONDARY' },
  { id: 'SEC_2', labelAr: 'الثاني الثانوي', stage: 'SECONDARY' },
  { id: 'SEC_3', labelAr: 'الثالث الثانوي (ثانوية عامة)', stage: 'SECONDARY' },
] as const;

export const EGYPTIAN_MOBILE_REGEX = /^(010|011|012|015)[0-9]{8}$/;
