/**
 * Platform Super-Admin API Routes
 *
 * ALL endpoints in this plugin are gated to SUPER_ADMIN role only.
 * They expose cross-tenant visibility intentionally — no tenantId scoping applies here.
 *
 * Routes:
 *   GET  /api/admin/stats              — Platform KPIs (MRR, centers count, trial counts)
 *   GET  /api/admin/tenants            — Paginated list of all registered centers
 *   GET  /api/admin/tenants/:id        — Detailed view of a single tenant
 *   PATCH /api/admin/tenants/:id/extend-trial   — Extend trial by N days
 *   PATCH /api/admin/tenants/:id/suspend        — Suspend or reactivate a tenant
 *   GET  /api/admin/audit-logs         — Latest 100 audit log entries across all tenants
 */

import type { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requireRoles } from '../auth/auth.js';
import { Role } from '../../../shared/constants/index.js';
import { getPlanConfig, calculateUsageWarning } from '../../../shared/constants/plans.js';
import { computeBillingPeriod, getTenantUsageSummary } from '../subscriptions/usageService.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const SUPER_ADMIN_GATE = [authenticate, requireRoles(Role.SUPER_ADMIN)];

// ─── Plugin ─────────────────────────────────────────────────────────────────

const adminRoutes: FastifyPluginAsync = async (app) => {

  // ── GET /api/admin/stats ────────────────────────────────────────────────
  app.get('/stats', { preHandler: SUPER_ADMIN_GATE }, async (_request, reply) => {
    const now = new Date();

    const [
      totalTenants,
      activeTenants,
      trialTenants,
      suspendedTenants,
      subscriptionAgg,
    ] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { isActive: true } }),
      prisma.tenant.count({
        where: {
          isActive: true,
          trialEndsAt: { gt: now },
          plan: 'FREE_TRIAL',
        },
      }),
      prisma.tenant.count({ where: { isActive: false } }),
      // MRR: sum of ACTIVE subscription amounts from the last 30 days
      prisma.subscription.aggregate({
        _sum: { amount: true },
        where: {
          status: 'ACTIVE',
          periodEnd: { gt: now },
        },
      }),
    ]);

    const mrr = Number(subscriptionAgg._sum.amount ?? 0);

    return reply.send({
      success: true,
      data: {
        totalTenants,
        activeTenants,
        trialTenants,
        suspendedTenants,
        mrrEgp: mrr,
      },
    });
  });

  // ── GET /api/admin/tenants ──────────────────────────────────────────────
  app.get<{ Querystring: { page?: string; limit?: string; search?: string; planFilter?: string; usageFilter?: string } }>(
    '/tenants',
    { preHandler: SUPER_ADMIN_GATE },
    async (request, reply) => {
      const page = Math.max(1, parseInt(request.query.page ?? '1', 10));
      const limit = Math.min(100, Math.max(1, parseInt(request.query.limit ?? '20', 10)));
      const skip = (page - 1) * limit;
      const search = request.query.search?.trim() ?? '';
      const planFilter = request.query.planFilter?.trim();

      const where: any = {};
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' as const } },
          { slug: { contains: search, mode: 'insensitive' as const } },
        ];
      }
      if (planFilter && planFilter !== 'ALL') {
        where.plan = planFilter;
      }

      const [tenants, total] = await Promise.all([
        prisma.tenant.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            isActive: true,
            trialEndsAt: true,
            maxDesks: true,
            maxBranches: true,
            createdAt: true,
            _count: {
              select: {
                users: true,
                students: true,
                sessions: true,
                branches: true,
              },
            },
            subscriptions: {
              where: { status: 'ACTIVE' },
              orderBy: { periodEnd: 'desc' },
              take: 1,
            },
          },
        }),
        prisma.tenant.count({ where }),
      ]);

      const now = new Date();

      // Gather usage records for each tenant in current billing period
      const tenantSummaries = await Promise.all(
        tenants.map(async (t) => {
          const activeSub = t.subscriptions[0] ?? null;
          const { periodStart, periodEnd } = computeBillingPeriod(now, activeSub);
          const planConfig = getPlanConfig(t.plan);

          const [usageRecords, activeReceptionists, actualBranches] = await Promise.all([
            prisma.usageRecord.findMany({
              where: {
                tenantId: t.id,
                periodStart: { gte: periodStart },
                periodEnd: { lte: periodEnd },
              },
            }),
            prisma.user.count({
              where: { tenantId: t.id, role: Role.RECEPTIONIST, isActive: true },
            }),
            prisma.branch.count({
              where: { tenantId: t.id, isActive: true },
            }),
          ]);

          let totalVisits = usageRecords.reduce((sum, r) => sum + r.visitCount, 0);
          if (usageRecords.length === 0) {
            totalVisits = await prisma.attendance.count({
              where: {
                tenantId: t.id,
                status: { not: 'VOID' },
                checkInTime: { gte: periodStart, lt: periodEnd },
              },
            });
          }

          const warning = calculateUsageWarning(totalVisits, planConfig.monthlyVisitLimit);

          return {
            ...t,
            trialDaysRemaining: t.trialEndsAt
              ? Math.max(0, Math.ceil((new Date(t.trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
              : 0,
            isTrialActive: t.trialEndsAt ? new Date(t.trialEndsAt) > now : false,
            userCount: t._count.users,
            studentCount: t._count.students,
            sessionCount: t._count.sessions,
            planDetails: planConfig,
            monthlyVisitLimit: planConfig.monthlyVisitLimit,
            usedVisits: totalVisits,
            usagePercentage: warning.percentage,
            remainingVisits: warning.remaining,
            warningLevel: warning.warningLevel,
            receptionistLimit: planConfig.maxReceptionists,
            receptionistCount: activeReceptionists,
            branchLimit: planConfig.maxBranches,
            branchCount: Math.max(1, actualBranches),
            billingPeriod: {
              start: periodStart.toISOString(),
              end: periodEnd.toISOString(),
            },
          };
        })
      );

      // Apply usage filter in-memory if specified
      let filteredTenants = tenantSummaries;
      const usageFilter = request.query.usageFilter?.trim();
      if (usageFilter === '80_PLUS') {
        filteredTenants = tenantSummaries.filter((t) => t.usagePercentage >= 80);
      } else if (usageFilter === '90_PLUS') {
        filteredTenants = tenantSummaries.filter((t) => t.usagePercentage >= 90);
      } else if (usageFilter === '100_REACHED') {
        filteredTenants = tenantSummaries.filter((t) => t.usagePercentage >= 100);
      }

      return reply.send({
        success: true,
        data: {
          tenants: filteredTenants,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        },
      });
    },
  );

  // ── GET /api/admin/tenants/:id ─────────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/tenants/:id',
    { preHandler: SUPER_ADMIN_GATE },
    async (request, reply) => {
      const { id } = request.params;

      const [tenant, subscriptions, recentAudit, usageSummary] = await Promise.all([
        prisma.tenant.findUnique({
          where: { id },
          include: {
            _count: { select: { users: true, students: true, teachers: true, sessions: true, branches: true } },
          },
        }),
        prisma.subscription.findMany({
          where: { tenantId: id },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
        prisma.auditLog.findMany({
          where: { actor: { tenantId: id } },
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { actor: { select: { username: true, fullName: true } } },
        }),
        getTenantUsageSummary(id).catch(() => null),
      ]);

      if (!tenant) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'TENANT_NOT_FOUND',
            message: 'المركز التعليمي غير موجود.',
            messageEn: 'Tenant not found.',
          },
        });
      }

      const now = new Date();

      return reply.send({
        success: true,
        data: {
          tenant: {
            ...tenant,
            trialDaysRemaining: tenant.trialEndsAt
              ? Math.max(0, Math.ceil((new Date(tenant.trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
              : 0,
            isTrialActive: tenant.trialEndsAt ? new Date(tenant.trialEndsAt) > now : false,
            userCount: tenant._count.users,
            studentCount: tenant._count.students,
            teacherCount: tenant._count.teachers,
            sessionCount: tenant._count.sessions,
            branchCount: tenant._count.branches,
          },
          usage: usageSummary,
          subscriptions: subscriptions.map((s) => ({ ...s, amount: s.amount.toString() })),
          recentAudit: recentAudit.map((a) => ({
            ...a,
            amount: a.amount?.toString() ?? null,
          })),
        },
      });
    },
  );

  // ── PATCH /api/admin/tenants/:id/extend-trial ──────────────────────────
  app.patch<{ Params: { id: string }; Body: { days: number } }>(
    '/tenants/:id/extend-trial',
    {
      preHandler: SUPER_ADMIN_GATE,
      schema: {
        body: {
          type: 'object',
          required: ['days'],
          properties: {
            days: { type: 'integer', minimum: 1, maximum: 365 },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { days } = request.body;

      const tenant = await prisma.tenant.findUnique({ where: { id } });
      if (!tenant) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'TENANT_NOT_FOUND',
            message: 'المركز التعليمي غير موجود.',
            messageEn: 'Tenant not found.',
          },
        });
      }

      const now = new Date();
      const currentTrialEnd = tenant.trialEndsAt && new Date(tenant.trialEndsAt) > now
        ? new Date(tenant.trialEndsAt)
        : now;

      const newTrialEnd = new Date(currentTrialEnd.getTime() + days * 24 * 60 * 60 * 1000);

      const updated = await prisma.tenant.update({
        where: { id },
        data: {
          trialEndsAt: newTrialEnd,
          // Keep plan as FREE_TRIAL if it currently is; don't downgrade paid tenants
          ...(tenant.plan === 'FREE_TRIAL' ? {} : {}),
        },
      });

      return reply.send({
        success: true,
        data: {
          id: updated.id,
          name: updated.name,
          trialEndsAt: updated.trialEndsAt,
          trialDaysRemaining: Math.ceil((newTrialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
        },
      });
    },
  );

  // ── PATCH /api/admin/tenants/:id/suspend ──────────────────────────────
  app.patch<{ Params: { id: string }; Body: { isActive: boolean } }>(
    '/tenants/:id/suspend',
    {
      preHandler: SUPER_ADMIN_GATE,
      schema: {
        body: {
          type: 'object',
          required: ['isActive'],
          properties: {
            isActive: { type: 'boolean' },
          },
          additionalProperties: false,
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { isActive } = request.body;

      const tenant = await prisma.tenant.findUnique({ where: { id } });
      if (!tenant) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'TENANT_NOT_FOUND',
            message: 'المركز التعليمي غير موجود.',
            messageEn: 'Tenant not found.',
          },
        });
      }

      const updated = await prisma.tenant.update({
        where: { id },
        data: { isActive },
        select: { id: true, name: true, isActive: true },
      });

      return reply.send({
        success: true,
        data: updated,
      });
    },
  );

  // ── GET /api/admin/audit-logs ──────────────────────────────────────────
  app.get<{ Querystring: { limit?: string } }>(
    '/audit-logs',
    { preHandler: SUPER_ADMIN_GATE },
    async (request, reply) => {
      const limit = Math.min(200, Math.max(1, parseInt(request.query.limit ?? '100', 10)));

      const logs = await prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          actor: {
            select: {
              username: true,
              fullName: true,
              role: true,
              tenant: { select: { id: true, name: true } },
            },
          },
        },
      });

      return reply.send({
        success: true,
        data: {
          logs: logs.map((l) => ({
            ...l,
            amount: l.amount?.toString() ?? null,
          })),
        },
      });
    },
  );
};

export default adminRoutes;
