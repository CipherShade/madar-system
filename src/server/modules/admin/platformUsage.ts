/**
 * Platform usage monitoring (super-admin console).
 *
 * One row per center with the real counts (users, receptionists, students,
 * visits inside the center's own billing window) next to the effective limit
 * — plan/tenant limit plus any active usage override — and the warning state
 * for each metric. Nothing here is estimated: a metric with no configured
 * limit is reported as "no limit" instead of a made-up percentage.
 */

import type { FastifyPluginAsync } from 'fastify';
import { Prisma, TenantPlan } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requireRoles } from '../auth/auth.js';
import { Role } from '../../../shared/constants/index.js';
import { USAGE_METRICS, USAGE_WARNING_PERCENT } from './billingMath.js';
import { buildCenterSearchWhere, computeUsageForTenants, paginationFromQuery, paginationPayload } from './platformHelpers.js';

const SUPER_ADMIN_GATE = [authenticate, requireRoles(Role.SUPER_ADMIN)];

const platformUsageRoutes: FastifyPluginAsync = async (app) => {
  app.get<{
    Querystring: { search?: string; status?: string; plan?: string; level?: string; page?: string; limit?: string };
  }>('/usage', { preHandler: SUPER_ADMIN_GATE }, async (request, reply) => {
    const { page, limit, skip } = paginationFromQuery(request.query, 25);
    const status = request.query.status ?? 'all';
    const searchWhere = buildCenterSearchWhere(request.query.search ?? '');

    const where: Prisma.TenantWhereInput = {
      ...(searchWhere ? { AND: [searchWhere] } : {}),
      ...(request.query.plan && request.query.plan !== 'all' ? { plan: request.query.plan as TenantPlan } : {}),
      ...(status === 'active' ? { isActive: true } : {}),
      ...(status === 'suspended' ? { isActive: false } : {}),
    };

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        select: {
          id: true, name: true, slug: true, plan: true, isActive: true,
          maxDesks: true, maxBranches: true, maxUsers: true, visitLimit: true, createdAt: true,
        },
      }),
      prisma.tenant.count({ where }),
    ]);

    const now = new Date();
    const usageRows = await computeUsageForTenants(tenants, now);
    const usageByTenant = new Map(usageRows.map((row) => [row.tenantId, row]));

    const levelFilter = request.query.level;
    const rows = tenants
      .map((tenant) => {
        const usage = usageByTenant.get(tenant.id);
        return {
          ...tenant,
          periodStart: usage?.periodStart ?? tenant.createdAt,
          userCount: usage?.userCount ?? 0,
          receptionistCount: usage?.receptionistCount ?? 0,
          studentCount: usage?.studentCount ?? 0,
          visitCount: usage?.visitCount ?? 0,
          metrics: usage?.metrics ?? [],
          warningCount: usage?.warningCount ?? 0,
          overCount: usage?.overCount ?? 0,
          highestLevel: usage?.highestLevel ?? 'none',
        };
      })
      .filter((row) => (levelFilter && levelFilter !== 'all' ? row.highestLevel === levelFilter : true));

    return reply.send({
      success: true,
      data: {
        rows,
        metrics: USAGE_METRICS,
        warningPercent: USAGE_WARNING_PERCENT,
        pagination: paginationPayload(page, limit, total),
      },
    });
  });
};

export default platformUsageRoutes;
