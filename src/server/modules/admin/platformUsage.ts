/**
 * Platform usage monitoring (super-admin console).
 *
 * One row per center with the real counts (users, receptionists, students,
 * visits inside the center's own billing window). The subscription is
 * unlimited, so no metric has a limit, a level, or a warning.
 */

import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requireRoles } from '../auth/auth.js';
import { Role } from '../../../shared/constants/index.js';
import { USAGE_METRICS } from './billingMath.js';
import { buildCenterSearchWhere, computeUsageForTenants, paginationFromQuery, paginationPayload } from './platformHelpers.js';

const SUPER_ADMIN_GATE = [authenticate, requireRoles(Role.SUPER_ADMIN)];

const platformUsageRoutes: FastifyPluginAsync = async (app) => {
  app.get<{
    Querystring: { search?: string; status?: string; page?: string; limit?: string };
  }>('/usage', { preHandler: SUPER_ADMIN_GATE }, async (request, reply) => {
    const { page, limit, skip } = paginationFromQuery(request.query, 25);
    const status = request.query.status ?? 'all';
    const searchWhere = buildCenterSearchWhere(request.query.search ?? '');

    const where: Prisma.TenantWhereInput = {
      ...(searchWhere ? { AND: [searchWhere] } : {}),
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
          id: true, name: true, slug: true, isActive: true, createdAt: true,
        },
      }),
      prisma.tenant.count({ where }),
    ]);

    const usageRows = await computeUsageForTenants(tenants, new Date());
    const usageByTenant = new Map(usageRows.map((row) => [row.tenantId, row]));

    const rows = tenants.map((tenant) => {
      const usage = usageByTenant.get(tenant.id);
      return {
        ...tenant,
        periodStart: usage?.periodStart ?? tenant.createdAt,
        userCount: usage?.userCount ?? 0,
        receptionistCount: usage?.receptionistCount ?? 0,
        studentCount: usage?.studentCount ?? 0,
        visitCount: usage?.visitCount ?? 0,
        branchCount: usage?.branchCount ?? 0,
        subscriptionStatus: usage?.subscriptionStatus ?? (tenant.isActive ? 'ACTIVE' : 'TRIALING'),
        metrics: usage?.metrics ?? [],
      };
    });

    return reply.send({
      success: true,
      data: {
        rows,
        metrics: USAGE_METRICS,
        pagination: paginationPayload(page, limit, total),
      },
    });
  });
};

export default platformUsageRoutes;
