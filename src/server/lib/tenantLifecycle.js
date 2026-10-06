import { prisma } from './prisma.js';
import { SubscriptionStatus } from '../../shared/constants/index.js';
/**
 * Tenant lifecycle: how much of the product a center may actually use, derived
 * purely from its subscription rows and the current time.
 *
 * The product rule this encodes:
 *   - nothing works until the owner approves the payment by hand
 *   - a paid center is reminded 3 days before its period ends
 *   - a lapsed center keeps working for a 7-day grace period
 *   - after that it freezes: read-only, old data still visible, no new writes
 *
 * Reminder and grace are counted in whole days on the Egypt (Africa/Cairo)
 * clock, not on raw 24h spans, so "3 days before" means 3 calendar days and a
 * freeze never lands mid-business-day.
 */
export const RENEWAL_REMINDER_DAYS = 3;
export const GRACE_PERIOD_DAYS = 7;
export const TENANT_LIFECYCLE_STATES = ['AWAITING_APPROVAL', 'ACTIVE', 'EXPIRING', 'GRACE', 'FROZEN'];
/**
 * Day boundaries are a fixed GMT+3 (Egypt Standard Time) with no DST, because
 * the business day is defined on that clock: a day starts at 12:00 AM GMT+3 and
 * a period may never straddle a freeze. A DST-aware zone cannot be used for the
 * boundary itself — an hour of shift in winter would put a freeze at 01:00 on
 * some days and 00:00 on others, and the reminder shown to the owner would then
 * disagree with the instant actually enforced.
 */
const EGYPT_OFFSET_MS = 3 * 60 * 60 * 1000;
/** Y-m-d of an instant as seen on the GMT+3 wall clock. */
function egyptDateKey(date) {
    return new Date(date.getTime() + EGYPT_OFFSET_MS).toISOString().slice(0, 10);
}
/** The real instant at which the given Y-m-d begins on the GMT+3 clock. */
function egyptDayStart(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day) - EGYPT_OFFSET_MS);
}
/** 12:00 AM GMT+3 on the business day that contains `date`. */
export function startOfEgyptDay(date) {
    return egyptDayStart(egyptDateKey(date));
}
/**
 * 12:00 AM GMT+3, `days` business days after `date`.
 *
 * Used to place subscription periods on the same day boundaries the grace and
 * freeze logic counts in, so a period can never end part-way through a
 * business day.
 */
export function addEgyptDays(date, days) {
    const shifted = new Date(startOfEgyptDay(date).getTime() + EGYPT_OFFSET_MS);
    shifted.setUTCDate(shifted.getUTCDate() + days);
    return egyptDayStart(shifted.toISOString().slice(0, 10));
}
/**
 * Whole calendar days from today (GMT+3) to `target` (GMT+3).
 * Same day = 0, tomorrow = 1, yesterday = -1. Uses calendar days so a period
 * that ends at 23:59 tonight reports 0 days left rather than a fraction.
 */
export function cairoDaysBetween(from, to) {
    // Both sides snap to 12:00 AM GMT+3, so the difference is a whole number of
    // business days with no rounding needed.
    return Math.round((startOfEgyptDay(to).getTime() - startOfEgyptDay(from).getTime()) / 86_400_000);
}
/** Start of the GMT+3 business day `days` away from `from`, as a real instant. */
function cairoDayStart(from, days) {
    return addEgyptDays(from, days);
}
/**
 * The instant an unpaid center freezes: 12:00 AM GMT+3 on the day after the
 * seven grace days.
 *
 * Grace covers the seven full GMT+3 calendar days *after* the day the period
 * ended, so a period that lapsed on the 20th is grace on the 21st..27th and
 * freezes at the start of the 28th. Single source of truth, so the date shown
 * to an expiring center can never disagree with the date actually enforced.
 */
export function computeFreezeInstant(periodEnd) {
    return cairoDayStart(periodEnd, GRACE_PERIOD_DAYS + 1);
}
/** The ACTIVE subscription whose period has not ended yet, if any. */
function findLiveSubscription(subscriptions, now) {
    const live = subscriptions.filter((sub) => sub.status === SubscriptionStatus.ACTIVE && new Date(sub.periodEnd).getTime() > now.getTime());
    if (live.length === 0)
        return null;
    // Newest period wins if an extension was added alongside the old row.
    return live.reduce((best, sub) => (new Date(sub.periodStart).getTime() > new Date(best.periodStart).getTime() ? sub : best));
}
/**
 * The most recent *paid* period that has already ended — the source of grace
 * and frozen.
 *
 * Restricted to ACTIVE on purpose. `/verify` is the only thing that grants
 * ACTIVE, so a pending or rejected attempt (rejection stamps `periodEnd` with
 * the current time) can never be mistaken for a paid period and hand a center
 * seven days of working product it never paid for.
 */
function findLatestExpired(subscriptions, now) {
    const ended = subscriptions.filter((sub) => sub.status === SubscriptionStatus.ACTIVE && new Date(sub.periodEnd).getTime() <= now.getTime());
    if (ended.length === 0)
        return null;
    return ended.reduce((best, sub) => (new Date(sub.periodEnd).getTime() > new Date(best.periodEnd).getTime() ? sub : best));
}
/**
 * Resolves the lifecycle from subscription history alone. Pure: no database, no
 * clock read, so every boundary is unit-testable.
 */
export function resolveTenantLifecycle(subscriptions, now) {
    const live = findLiveSubscription(subscriptions, now);
    if (live) {
        const periodEnd = new Date(live.periodEnd);
        const daysUntilExpiry = cairoDaysBetween(now, periodEnd);
        const expiring = daysUntilExpiry <= RENEWAL_REMINDER_DAYS;
        return {
            state: expiring ? 'EXPIRING' : 'ACTIVE',
            canWrite: true,
            readOnly: false,
            activePeriodStart: new Date(live.periodStart).toISOString(),
            activePeriodEnd: periodEnd.toISOString(),
            daysUntilExpiry,
            freezesAt: computeFreezeInstant(periodEnd).toISOString(),
            reminder: expiring
                ? {
                    code: 'RENEWAL_DUE',
                    severity: 'warning',
                    messageAr: `اشتراكك ينتهي بعد ${Math.max(0, daysUntilExpiry)} يوم. جدد الآن حتى لا يتوقف المركز.`,
                    messageEn: `Your subscription ends in ${Math.max(0, daysUntilExpiry)} day(s). Renew now so the center keeps running.`,
                }
                : null,
        };
    }
    const expired = findLatestExpired(subscriptions, now);
    if (!expired) {
        // No live period and nothing has ever expired: either brand new and
        // unapproved, or every attempt was rejected.
        return {
            state: 'AWAITING_APPROVAL',
            canWrite: false,
            readOnly: true,
            activePeriodStart: null,
            activePeriodEnd: null,
            daysUntilExpiry: null,
            freezesAt: null,
            reminder: {
                code: 'AWAITING_APPROVAL',
                severity: 'info',
                messageAr: 'حسابك في انتظار تأكيد الدفع من إدارة المنصة. لا يمكن إضافة أي بيانات قبل التأكيد.',
                messageEn: 'Your account is awaiting payment confirmation. No data can be added until it is approved.',
            },
        };
    }
    const periodEnd = new Date(expired.periodEnd);
    const freezesAt = computeFreezeInstant(periodEnd);
    const frozen = now.getTime() >= freezesAt.getTime();
    if (frozen) {
        return {
            state: 'FROZEN',
            canWrite: false,
            readOnly: true,
            activePeriodStart: null,
            activePeriodEnd: null,
            daysUntilExpiry: null,
            freezesAt: freezesAt.toISOString(),
            reminder: {
                code: 'FROZEN',
                severity: 'critical',
                messageAr: 'تم تجميد الحساب لعدم سداد الاشتراك. بياناتك السابقة متاحة للعرض فقط، وتجديد الاشتراك يعيد التشغيل فوراً.',
                messageEn: 'This account is frozen for non-payment. Your existing data is view-only, and renewing restores it immediately.',
            },
        };
    }
    const graceDaysLeft = Math.max(0, cairoDaysBetween(now, freezesAt));
    return {
        state: 'GRACE',
        canWrite: true,
        readOnly: false,
        activePeriodStart: null,
        activePeriodEnd: null,
        daysUntilExpiry: 0,
        freezesAt: freezesAt.toISOString(),
        reminder: {
            code: 'GRACE_PERIOD',
            severity: 'warning',
            messageAr: `انتهى اشتراكك. لديك ${graceDaysLeft} يوم لتجديده قبل تجميد الحساب.`,
            messageEn: `Your subscription has ended. You have ${graceDaysLeft} day(s) to renew before the account freezes.`,
        },
    };
}
/** Reads the subscription rows a lifecycle decision needs. */
export async function loadTenantLifecycle(tenantId, client = prisma, now = new Date()) {
    const subscriptions = await client.subscription.findMany({
        where: { tenantId },
        select: { status: true, periodStart: true, periodEnd: true },
        orderBy: { periodStart: 'desc' },
    });
    return resolveTenantLifecycle(subscriptions, now);
}
let resolverOverride = null;
/**
 * Test seam. The HTTP guard suite runs without a database, so it swaps the
 * subscription lookup for a fixed decision instead of provisioning a real
 * center. Production never calls this: the default path always reads the
 * database and always fails closed.
 */
export function setLifecycleResolverForTests(fn) {
    resolverOverride = fn;
}
const LIFECYCLE_MESSAGES = {
    AWAITING_APPROVAL: {
        messageAr: 'حسابك في انتظار تأكيد الدفع من إدارة المنصة. لا يمكن إضافة أي بيانات قبل التأكيد.',
        messageEn: 'Your account is awaiting payment confirmation. No data can be added until it is approved.',
    },
    FROZEN: {
        messageAr: 'تم تجميد الحساب لعدم سداد الاشتراك. بياناتك السابقة متاحة للعرض فقط، وتجديد الاشتراك يعيد التشغيل فوراً.',
        messageEn: 'This account is frozen for non-payment. Your existing data is view-only, and renewing restores it immediately.',
    },
    ACTIVE: { messageAr: '', messageEn: '' },
    EXPIRING: { messageAr: '', messageEn: '' },
    GRACE: { messageAr: '', messageEn: '' },
};
/**
 * preHandler for every tenant business write. Reads are never blocked, so a
 * pending or frozen center can still log in and see its own data.
 *
 * Routes that must stay reachable while the tenant cannot write — login,
 * logout, change-password, and the upgrade/pay endpoint — deliberately omit
 * this guard. So do all superadmin routes, which operate across tenants.
 */
export async function requireTenantWritable(request, reply) {
    const tenantId = request.user?.tenantId;
    if (!tenantId) {
        // Fail closed. A user with no tenant reaching a tenant business route means
        // the request is malformed or a scoping bug, and allowing it through would
        // write rows with no owner to hold them accountable.
        return reply.code(403).send({
            success: false,
            error: {
                code: 'TENANT_CONTEXT_MISSING',
                message: 'هذا الطلب لا يخص مركزاً مسجلاً. سجل دخولك مرة أخرى.',
                messageEn: 'This request is not scoped to a registered center. Please sign in again.',
            },
        });
    }
    const lifecycle = resolverOverride
        ? await resolverOverride(tenantId)
        : await loadTenantLifecycle(tenantId);
    if (lifecycle.canWrite)
        return;
    const copy = LIFECYCLE_MESSAGES[lifecycle.state];
    return reply.code(403).send({
        success: false,
        error: {
            code: lifecycle.state === 'FROZEN' ? 'TENANT_FROZEN' : 'TENANT_NOT_APPROVED',
            message: lifecycle.reminder?.messageAr || copy.messageAr,
            messageEn: lifecycle.reminder?.messageEn || copy.messageEn,
            details: {
                state: lifecycle.state,
                readOnly: true,
                freezesAt: lifecycle.freezesAt,
            },
        },
    });
}
