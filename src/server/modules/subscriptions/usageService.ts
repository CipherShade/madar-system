import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import {
  getPlanConfig,
  calculateUsageWarning,
  canAddReceptionist,
  canAddBranch,
  canCheckIn,
  type PlanDefinition,
  type WarningLevel,
} from '../../../shared/constants/plans.js';
import { Role, AttendanceStatus, SubscriptionStatus } from '../../../shared/constants/index.js';

export interface TenantUsageSummary {
  tenantId: string;
  tenantName: string;
  plan: PlanDefinition;
  rawPlanKey: string;
  periodStart: string;
  periodEnd: string;
  usedVisits: number;
  monthlyLimit: number;
  remainingVisits: number;
  percentage: number;
  warningLevel: WarningLevel;
  warningMessageAr: string | null;
  warningMessageEn: string | null;
  isBlocked: boolean;
  receptionistCount: number;
  receptionistLimit: number | null;
  canAddReceptionist: boolean;
  branchCount: number;
  branchLimit: number | null;
  canAddBranch: boolean;
  branchUsage: Array<{
    branchId: string | null;
    branchName: string;
    visitCount: number;
  }>;
}

/**
 * Pure helper to compute billing period.
 */
export function computeBillingPeriod(
  now: Date = new Date(),
  subscription?: { periodStart: Date; periodEnd: Date; status?: string } | null
): { periodStart: Date; periodEnd: Date } {
  if (
    subscription &&
    (!subscription.status || subscription.status === SubscriptionStatus.ACTIVE) &&
    now >= subscription.periodStart &&
    now < subscription.periodEnd
  ) {
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
 * Fetches the comprehensive usage and limit summary for a specific tenant.
 */
export async function getTenantUsageSummary(tenantId: string, now: Date = new Date()): Promise<TenantUsageSummary> {
  const [tenant, activeSub, activeReceptionistsCount, branchesCount, branchRecords] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, plan: true, createdAt: true },
    }),
    prisma.subscription.findFirst({
      where: { tenantId, status: SubscriptionStatus.ACTIVE, periodEnd: { gt: now } },
      orderBy: { periodEnd: 'desc' },
    }),
    prisma.user.count({
      where: { tenantId, role: Role.RECEPTIONIST, isActive: true },
    }),
    prisma.branch.count({
      where: { tenantId, isActive: true },
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
  const planConfig = getPlanConfig(tenant.plan);

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

  const warning = calculateUsageWarning(totalVisits, planConfig.monthlyVisitLimit ?? 0);
  const actualBranchCount = Math.max(1, branchesCount);

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
    plan: planConfig,
    rawPlanKey: tenant.plan,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    usedVisits: totalVisits,
    monthlyLimit: planConfig.monthlyVisitLimit ?? 0,
    remainingVisits: warning.remaining,
    percentage: warning.percentage,
    warningLevel: warning.warningLevel,
    warningMessageAr: warning.messageAr,
    warningMessageEn: warning.messageEn,
    isBlocked: warning.isBlocked,
    receptionistCount: activeReceptionistsCount,
    receptionistLimit: planConfig.maxReceptionists,
    canAddReceptionist: canAddReceptionist(activeReceptionistsCount, tenant.plan),
    branchCount: actualBranchCount,
    branchLimit: planConfig.maxBranches,
    canAddBranch: canAddBranch(actualBranchCount, tenant.plan),
    branchUsage: branchUsageList,
  };
}

/**
 * Validates plan limits and increments monthly visit count atomically inside a Prisma transaction.
 * Throws VISIT_LIMIT_REACHED if tenant has reached their plan's monthly visit capacity.
 */
export async function checkAndIncrementVisitUsage(
  tx: Prisma.TransactionClient,
  params: {
    tenantId: string;
    branchId?: string | null;
    now?: Date;
  }
): Promise<{ newVisitCount: number; limit: number; remaining: number }> {
  const { tenantId, branchId, now = new Date() } = params;

  // 1. Fetch tenant & plan
  const tenant = await tx.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true },
  });

  const planKey = tenant?.plan || 'BASIC';
  const planConfig = getPlanConfig(planKey);

  // 2. Fetch active subscription for billing period
  const activeSub = await tx.subscription.findFirst({
    where: { tenantId, status: SubscriptionStatus.ACTIVE, periodEnd: { gt: now } },
    orderBy: { periodEnd: 'desc' },
  });

  const { periodStart, periodEnd } = computeBillingPeriod(now, activeSub);

  // 3. Aggregate current visits for this billing period
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

  // 4. Server-Side Limit Check
  if (!canCheckIn(currentTenantVisits, planKey)) {
    const error = new Error('VISIT_LIMIT_REACHED');
    (error as unknown as { code: string }).code = 'VISIT_LIMIT_REACHED';
    throw error;
  }

  // 5. Upsert / increment UsageRecord for this branch and period
  const targetBranchId = branchId || null;
  const existingBranchRecord = existingRecords.find((r) => r.branchId === targetBranchId);

  if (existingBranchRecord) {
    await tx.usageRecord.update({
      where: { id: existingBranchRecord.id },
      data: { visitCount: { increment: 1 } },
    });
  } else {
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

  const newTotal = currentTenantVisits + 1;
  const remaining = Math.max(0, (planConfig.monthlyVisitLimit ?? 0) - newTotal);

  return {
    newVisitCount: newTotal,
    limit: planConfig.monthlyVisitLimit ?? 0,
    remaining,
  };
}
