export const ROLES = {
    SUPER_ADMIN: 'SUPER_ADMIN',
    ADMIN: 'ADMIN',
    RECEPTIONIST: 'RECEPTIONIST',
};
export const Role = ROLES;
/**
 * Roles that may be assigned to an account through any API.
 *
 * SUPER_ADMIN is deliberately excluded, and that exclusion is load-bearing: it
 * is the platform owner's role, it spans every center, and it can read and
 * change any tenant's data. It is only ever established at first boot from
 * `SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD`, or by the demo seeder. No
 * route — tenant-facing or platform console — can grant it, because every
 * assignment path reads this one list.
 *
 * Both a center's own user screen (`/api/users`) and the platform console
 * (`/api/admin/users/:id`) must use this. A local copy in either module is how
 * a center admin ends up able to promote a second login they control and take
 * over the platform.
 */
export const ASSIGNABLE_ROLES = [Role.ADMIN, Role.RECEPTIONIST];
export function isAssignableRole(role) {
    return typeof role === 'string' && ASSIGNABLE_ROLES.includes(role);
}
export * from './subscription.js';
export * from './offers.js';
export const SUBSCRIPTION_STATUSES = {
    PENDING: 'PENDING',
    TRIALING: 'TRIALING',
    ACTIVE: 'ACTIVE',
    PAST_DUE: 'PAST_DUE',
    CANCELED: 'CANCELED',
    EXPIRED: 'EXPIRED',
};
export const SubscriptionStatus = SUBSCRIPTION_STATUSES;
export const PAYMENT_METHODS = {
    CASH: 'CASH',
    VODAFONE_CASH: 'VODAFONE_CASH',
    INSTAPAY: 'INSTAPAY',
};
export const PaymentMethod = PAYMENT_METHODS;
export const PAYMENT_METHOD_LABELS_AR = {
    CASH: 'كاش (نقدي)',
    VODAFONE_CASH: 'فودافون كاش / محفظة',
    INSTAPAY: 'إنستاباي (تحويل بنكي)',
};
export const SESSION_STATUSES = {
    SCHEDULED: 'SCHEDULED',
    ACTIVE: 'ACTIVE',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
};
export const SessionStatus = SESSION_STATUSES;
export const SESSION_STATUS_LABELS_AR = {
    SCHEDULED: 'مجدولة قريباً',
    ACTIVE: 'جارية الآن',
    COMPLETED: 'منتهية ومقفلة',
    CANCELLED: 'ملغاة',
};
export const SHIFT_STATUSES = {
    OPEN: 'OPEN',
    CLOSED: 'CLOSED',
};
export const ShiftStatus = SHIFT_STATUSES;
export const ATTENDANCE_STATUSES = {
    PAID: 'PAID',
    PARTIAL: 'PARTIAL',
    EXCUSED: 'EXCUSED',
    VOID: 'VOID',
};
export const AttendanceStatus = ATTENDANCE_STATUSES;
export const SETTLEMENT_STATUSES = {
    PENDING: 'PENDING',
    DISBURSED: 'DISBURSED',
};
export const SettlementStatus = SETTLEMENT_STATUSES;
export const SCHOOL_TYPES = {
    GENERAL: 'GENERAL',
    LANGUAGES: 'LANGUAGES',
    AZHAR: 'AZHAR',
};
export const SchoolType = SCHOOL_TYPES;
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
];
export const EGYPTIAN_MOBILE_REGEX = /^(010|011|012|015)[0-9]{8}$/;
