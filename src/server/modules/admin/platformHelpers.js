/**
 * Shared helpers for the super-admin platform route modules
 * (users, usage, billing/revenue).
 *
 * Kept in one place so every platform route answers errors in the same
 * envelope, parses pagination identically, and — most importantly — measures
 * usage through exactly the same window rules as the center-facing
 * subscriptions API.
 */
import { Prisma } from '@prisma/client';
import { AttendanceStatus, Role } from '../../../shared/constants/index.js';
import { normalizeArabicText } from '../../../shared/utils/arabicNormalization.js';
import { prisma } from '../../lib/prisma.js';
import { resolveUsagePeriodStart } from '../subscriptions/subscriptions.js';
import { computeTenantUsage } from './billingMath.js';
export function fail(reply, status, code, message, messageEn) {
    return reply.code(status).send({ success: false, error: { code, message, messageEn } });
}
export function toInt(value, fallback, min, max) {
    const parsed = Number.parseInt(value ?? '', 10);
    if (!Number.isFinite(parsed))
        return fallback;
    return Math.min(max, Math.max(min, parsed));
}
export function paginationFromQuery(query, defaultLimit = 20) {
    const page = toInt(query.page, 1, 1, 10_000);
    const limit = toInt(query.limit, defaultLimit, 1, 200);
    return { page, limit, skip: (page - 1) * limit };
}
export function paginationPayload(page, limit, total) {
    return { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) };
}
/**
 * Arabic-insensitive search: the term is normalized with the app's shared
 * utility and matched against the stored normalized name column, so
 * "احمد" finds "أحمد". Latin fields (username/email/phone) are matched
 * case-insensitively as typed.
 */
export function buildUserSearchWhere(search) {
    const raw = search.trim();
    if (!raw)
        return null;
    const normalized = normalizeArabicText(raw);
    const insensitive = { contains: raw, mode: 'insensitive' };
    return {
        OR: [
            { searchName: { contains: normalized } },
            { fullName: insensitive },
            { username: insensitive },
            { email: insensitive },
            { phoneNumber: insensitive },
        ],
    };
}
export function buildCenterSearchWhere(search) {
    const raw = search.trim();
    if (!raw)
        return null;
    const normalized = normalizeArabicText(raw);
    const insensitive = { contains: raw, mode: 'insensitive' };
    return {
        OR: [
            { searchName: { contains: normalized } },
            { name: insensitive },
            { slug: insensitive },
            { ownerName: insensitive },
            { ownerPhone: insensitive },
        ],
    };
}
/**
 * Visit counts for many centers in one round trip, each counted inside its own
 * billing window (the active subscription period, else creation date). VOID
 * attendances are never counted — the same rule the center dashboard uses.
 */
async function countVisitsPerTenant(periods, tenantIds) {
    const counts = new Map();
    if (tenantIds.length === 0)
        return counts;
    const tuples = tenantIds
        .filter((id) => periods.has(id))
        .map((id) => Prisma.sql `(${id}::text, ${periods.get(id)}::timestamptz)`);
    if (tuples.length === 0)
        return counts;
    const rows = await prisma.$queryRaw(Prisma.sql `
    SELECT v."tenantId" AS "tenantId", count(a."id")::bigint AS "visits"
    FROM (VALUES ${Prisma.join(tuples, ', ')}) AS v("tenantId", "periodStart")
    LEFT JOIN "sessions" s ON s."tenant_id" = v."tenantId"
    LEFT JOIN "attendances" a
      ON a."session_id" = s."id"
      AND a."status" <> ${AttendanceStatus.VOID}
      AND a."check_in_time" >= v."periodStart"
    GROUP BY v."tenantId"
  `);
    for (const row of rows)
        counts.set(row.tenantId, Number(row.visits));
    for (const id of tenantIds)
        if (!counts.has(id))
            counts.set(id, 0);
    return counts;
}
/**
 * Full usage picture for the given centers: counts per metric. The product is
 * unlimited, so there is no effective limit and no warning state.
 */
export async function computeUsageForTenants(tenants, now = new Date()) {
    if (tenants.length === 0)
        return [];
    const tenantIds = tenants.map((tenant) => tenant.id);
    const [activeSubscriptions, allSubscriptions, userCounts, receptionistCounts, studentCounts, branchCounts] = await Promise.all([
        prisma.subscription.findMany({
            where: { tenantId: { in: tenantIds }, status: 'ACTIVE' },
            select: { tenantId: true, status: true, periodStart: true, periodEnd: true },
            orderBy: { periodStart: 'desc' },
        }),
        prisma.subscription.findMany({
            where: { tenantId: { in: tenantIds } },
            select: { tenantId: true, status: true },
            orderBy: { createdAt: 'desc' },
        }),
        prisma.user.groupBy({ by: ['tenantId'], where: { tenantId: { in: tenantIds } }, _count: { _all: true } }),
        prisma.user.groupBy({
            by: ['tenantId'],
            where: { tenantId: { in: tenantIds }, role: Role.RECEPTIONIST },
            _count: { _all: true },
        }),
        prisma.student.groupBy({ by: ['tenantId'], where: { tenantId: { in: tenantIds } }, _count: { _all: true } }),
        prisma.branch.groupBy({ by: ['tenantId'], where: { tenantId: { in: tenantIds }, isActive: true }, _count: { _all: true } }),
    ]);
    const byTenantSubscriptions = new Map();
    for (const sub of activeSubscriptions) {
        const list = byTenantSubscriptions.get(sub.tenantId) ?? [];
        list.push(sub);
        byTenantSubscriptions.set(sub.tenantId, list);
    }
    const latestStatusByTenant = new Map();
    for (const sub of allSubscriptions) {
        if (!latestStatusByTenant.has(sub.tenantId)) {
            latestStatusByTenant.set(sub.tenantId, sub.status);
        }
    }
    const periodStarts = new Map();
    for (const tenant of tenants) {
        periodStarts.set(tenant.id, resolveUsagePeriodStart(tenant.createdAt, byTenantSubscriptions.get(tenant.id) ?? [], now));
    }
    const [visitCounts, userByTenant, receptionistsByTenant, studentsByTenant, branchesByTenant] = await Promise.all([
        countVisitsPerTenant(periodStarts, tenantIds),
        new Map(userCounts.map((row) => [row.tenantId, row._count._all])),
        new Map(receptionistCounts.map((row) => [row.tenantId, row._count._all])),
        new Map(studentCounts.map((row) => [row.tenantId, row._count._all])),
        new Map(branchCounts.map((row) => [row.tenantId, row._count._all])),
    ]);
    return tenants.map((tenant) => {
        const branchCount = branchesByTenant.get(tenant.id) ?? 0;
        const subscriptionStatus = latestStatusByTenant.get(tenant.id) ?? (tenant.isActive ? 'ACTIVE' : 'TRIALING');
        const summary = computeTenantUsage({
            userCount: userByTenant.get(tenant.id) ?? 0,
            receptionistCount: receptionistsByTenant.get(tenant.id) ?? 0,
            studentCount: studentsByTenant.get(tenant.id) ?? 0,
            visitCount: visitCounts.get(tenant.id) ?? 0,
            branchCount,
        });
        return {
            tenantId: tenant.id,
            periodStart: periodStarts.get(tenant.id) ?? tenant.createdAt,
            userCount: userByTenant.get(tenant.id) ?? 0,
            receptionistCount: receptionistsByTenant.get(tenant.id) ?? 0,
            studentCount: studentsByTenant.get(tenant.id) ?? 0,
            visitCount: visitCounts.get(tenant.id) ?? 0,
            branchCount,
            subscriptionStatus,
            ...summary,
        };
    });
}
