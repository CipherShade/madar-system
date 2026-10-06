import { prisma } from '../../lib/prisma.js';
import { AttendanceStatus, SubscriptionStatus } from '../../../shared/constants/index.js';
/**
 * Pure helper to compute billing period.
 */
export function computeBillingPeriod(now = new Date(), subscription) {
    if (subscription &&
        (!subscription.status || subscription.status === SubscriptionStatus.ACTIVE) &&
        now >= subscription.periodStart &&
        now < subscription.periodEnd) {
        return {
            periodStart: subscription.periodStart,
            periodEnd: subscription.periodEnd,
        };
    }
    // Default to 1st of current UTC month to 1st of next UTC month
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const periodStart = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
    const periodEnd = new Date(Date.UTC(month === 11 ? year + 1 : year, (month + 1) % 12, 1, 0, 0, 0, 0));
    return { periodStart, periodEnd };
}
/**
 * Fetches the visit usage summary for a tenant for the current billing period.
 */
export async function getTenantUsageSummary(tenantId, now = new Date()) {
    const [tenant, activeSub, branchRecords] = await Promise.all([
        prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { id: true, name: true },
        }),
        prisma.subscription.findFirst({
            where: { tenantId, status: SubscriptionStatus.ACTIVE, periodEnd: { gt: now } },
            orderBy: { periodEnd: 'desc' },
        }),
        prisma.branch.findMany({
            where: { tenantId, isActive: true },
            select: { id: true, name: true },
        }),
    ]);
    if (!tenant) {
        throw new Error('TENANT_NOT_FOUND');
    }
    const { periodStart, periodEnd } = computeBillingPeriod(now, activeSub);
    // Retrieve usage records for this billing cycle
    const usageRecords = await prisma.usageRecord.findMany({
        where: {
            tenantId,
            periodStart: { gte: periodStart },
            periodEnd: { lte: periodEnd },
        },
        include: { branch: true },
    });
    // Calculate total visits from UsageRecords or fallback to Attendance query
    let totalVisits = usageRecords.reduce((sum, r) => sum + r.visitCount, 0);
    // If no UsageRecord exists yet (or migration just happened), compute from live attendances
    if (usageRecords.length === 0) {
        const liveCount = await prisma.attendance.count({
            where: {
                tenantId,
                status: { not: AttendanceStatus.VOID },
                checkInTime: { gte: periodStart, lt: periodEnd },
            },
        });
        totalVisits = liveCount;
    }
    const branchUsageList = branchRecords.map((b) => {
        const record = usageRecords.find((r) => r.branchId === b.id);
        return {
            branchId: b.id,
            branchName: b.name,
            visitCount: record ? record.visitCount : 0,
        };
    });
    return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        usedVisits: totalVisits,
        branchUsage: branchUsageList,
    };
}
/**
 * Increments the monthly visit count for reporting, inside a Prisma transaction.
 * Never rejects: the subscription is unlimited, so a visit is always recorded.
 */
export async function recordVisitUsage(tx, params) {
    const { tenantId, branchId, now = new Date() } = params;
    // Fetch active subscription for billing period
    const activeSub = await tx.subscription.findFirst({
        where: { tenantId, status: SubscriptionStatus.ACTIVE, periodEnd: { gt: now } },
        orderBy: { periodEnd: 'desc' },
    });
    const { periodStart, periodEnd } = computeBillingPeriod(now, activeSub);
    // Aggregate current visits for this billing period
    const existingRecords = await tx.usageRecord.findMany({
        where: {
            tenantId,
            periodStart: { gte: periodStart },
            periodEnd: { lte: periodEnd },
        },
    });
    let currentTenantVisits = existingRecords.reduce((sum, r) => sum + r.visitCount, 0);
    // If no record exists yet, sync with live attendances
    if (existingRecords.length === 0) {
        const liveCount = await tx.attendance.count({
            where: {
                tenantId,
                status: { not: AttendanceStatus.VOID },
                checkInTime: { gte: periodStart, lt: periodEnd },
            },
        });
        currentTenantVisits = liveCount;
    }
    // Upsert / increment UsageRecord for this branch and period
    const targetBranchId = branchId || null;
    const existingBranchRecord = existingRecords.find((r) => r.branchId === targetBranchId);
    if (existingBranchRecord) {
        await tx.usageRecord.update({
            where: { id: existingBranchRecord.id },
            data: { visitCount: { increment: 1 } },
        });
    }
    else {
        await tx.usageRecord.create({
            data: {
                tenantId,
                branchId: targetBranchId,
                periodStart,
                periodEnd,
                visitCount: 1,
            },
        });
    }
    return { newVisitCount: currentTenantVisits + 1 };
}
