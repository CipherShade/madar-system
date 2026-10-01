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
 *   GET  /api/admin/console-stats      — Platform console KPIs v2 (MRR, portal + support counters)
 *   POST /api/admin/tenants/:id/view-as — Start View-as-Center impersonation (30m scoped JWT)
 *   POST /api/admin/view-as/return     — End the active View-as-Center session
 */

import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import argon2 from 'argon2';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requireRoles } from '../auth/auth.js';
import { Role } from '../../../shared/constants/index.js';
import { MONTHLY_PRICE_EGP } from '../../../shared/constants/subscription.js';
import { normalizeArabicText } from '../../../shared/utils/arabicNormalization.js';
import { recordSuperAdminAudit } from './audit.js';
import { buildCenterSearchWhere, computeUsageForTenants, fail, paginationFromQuery, paginationPayload } from './platformHelpers.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const SUPER_ADMIN_GATE = [authenticate, requireRoles(Role.SUPER_ADMIN)];
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function generateTemporaryPassword(): string {
  let password = '';
  for (let index = 0; index < 14; index += 1) {
    password += TEMP_PASSWORD_ALPHABET[Math.floor(Math.random() * TEMP_PASSWORD_ALPHABET.length)];
  }
  return `Mdr!${password}`;
}

function serializeTenant(tenant: {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  trialEndsAt: Date | null;
  discountBalance: Prisma.Decimal;
  creditBalance: Prisma.Decimal;
  createdAt: Date;
}, now: Date) {
  return {
    ...tenant,
    priceMonthly: MONTHLY_PRICE_EGP,
    discountBalance: tenant.discountBalance.toString(),
    creditBalance: tenant.creditBalance.toString(),
    trialDaysRemaining: tenant.trialEndsAt
      ? Math.max(0, Math.ceil((new Date(tenant.trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0,
    isTrialActive: tenant.trialEndsAt ? new Date(tenant.trialEndsAt) > now : false,
  };
}

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
  app.get<{
    Querystring: {
      page?: string;
      limit?: string;
      search?: string;
      status?: string;
      paymentStatus?: string;
      sort?: string;
    };
  }>('/tenants', { preHandler: SUPER_ADMIN_GATE }, async (request, reply) => {
    const { page, limit, skip } = paginationFromQuery(request.query);
    const status = request.query.status ?? 'all';
    const paymentStatus = request.query.paymentStatus ?? 'all';
    const searchWhere = buildCenterSearchWhere(request.query.search ?? '');

    const where: Prisma.TenantWhereInput = {
      ...(searchWhere ? { AND: [searchWhere] } : {}),
      ...(status === 'active' ? { isActive: true } : {}),
      ...(status === 'suspended' ? { isActive: false } : {}),
      ...(status === 'trial' ? { isActive: true, trialEndsAt: { gt: new Date() } } : {}),
    };

    const sort = request.query.sort ?? 'newest';
    const orderBy: Prisma.TenantOrderByWithRelationInput =
      sort === 'oldest' ? { createdAt: 'asc' }
        : sort === 'name' ? { name: 'asc' }
          : { createdAt: 'desc' };

    const [tenants, total] = await Promise.all([
      prisma.tenant.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true,
          trialEndsAt: true,
          ownerName: true,
          ownerPhone: true,
          discountBalance: true,
          creditBalance: true,
          createdAt: true,
          _count: { select: { users: true, students: true, sessions: true, teachers: true } },
        },
      }),
      prisma.tenant.count({ where }),
    ]);

    const now = new Date();
    const tenantIds = tenants.map((tenant) => tenant.id);
    const [usageRows, activeSubscriptions, owners] = await Promise.all([
      computeUsageForTenants(tenants, now),
      prisma.subscription.findMany({
        where: { tenantId: { in: tenantIds }, status: { in: ['ACTIVE', 'TRIALING'] } },
        select: { tenantId: true, amount: true, periodStart: true, periodEnd: true, status: true, paymentMethod: true },
        orderBy: { periodEnd: 'desc' },
      }),
      prisma.user.findMany({
        where: { tenantId: { in: tenantIds }, role: Role.ADMIN },
        select: { tenantId: true, fullName: true, username: true, phoneNumber: true, email: true, isActive: true, lastLoginAt: true },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const usageByTenant = new Map(usageRows.map((row) => [row.tenantId, row]));
    const subscriptionByTenant = new Map<string, (typeof activeSubscriptions)[number]>();
    for (const subscription of activeSubscriptions) {
      if (!subscriptionByTenant.has(subscription.tenantId)) subscriptionByTenant.set(subscription.tenantId, subscription);
    }
    const ownerByTenant = new Map(owners.map((owner) => [owner.tenantId, owner]));

    const rows = tenants.map((tenant) => {
      const usage = usageByTenant.get(tenant.id);
      const subscription = subscriptionByTenant.get(tenant.id);
      const owner = ownerByTenant.get(tenant.id);

      return {
        ...serializeTenant(tenant, now),
        renewalDate: subscription ? subscription.periodEnd : null,
        renewalAmount: subscription ? subscription.amount.toString() : null,
        paymentStatus: subscription
          ? subscription.status === 'ACTIVE'
            ? 'paid'
            : subscription.status === 'TRIALING'
              ? 'trial'
              : 'due'
          : 'none',
        visitsThisPeriod: usage?.visitCount ?? 0,
        userCount: tenant._count.users,
        receptionistCount: usage?.receptionistCount ?? 0,
        studentCount: tenant._count.students,
        teacherCount: tenant._count.teachers,
        sessionCount: tenant._count.sessions,
        owner: owner
          ? {
            name: owner.fullName,
            username: owner.username,
            phoneNumber: owner.phoneNumber,
            email: owner.email,
            isActive: owner.isActive,
            lastLoginAt: owner.lastLoginAt,
          }
          : null,
        // No Branch model exists, so the allowance is shown but never filled.
        branchesUsed: null as number | null,
      };
    });

    const filtered =
      paymentStatus === 'all'
        ? rows
        : rows.filter((row) => {
          if (paymentStatus === 'paid' && row.paymentStatus !== 'paid') return false;
          if (paymentStatus === 'due' && row.paymentStatus !== 'due') return false;
          if (paymentStatus === 'none' && row.paymentStatus !== 'none') return false;
          return true;
        });

    return reply.send({
      success: true,
      data: {
        tenants: filtered,
        pagination: paginationPayload(page, limit, total),
      },
    });
  });

  // ── POST /api/admin/tenants — create a center with its owner account ───
  app.post<{
    Body: {
      name: string;
      ownerName: string;
      ownerPhone: string;
      username: string;
      password?: string;
      reason?: string;
    };
  }>(
    '/tenants',
    {
      preHandler: SUPER_ADMIN_GATE,
      schema: {
        body: {
          type: 'object',
          required: ['name', 'ownerName', 'ownerPhone', 'username'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 100 },
            ownerName: { type: 'string', minLength: 2, maxLength: 100 },
            ownerPhone: { type: 'string', pattern: '^(010|011|012|015)[0-9]{8}$' },
            username: { type: 'string', minLength: 3, maxLength: 50, pattern: '^[a-zA-Z0-9_-]+$' },
            password: { type: 'string', minLength: 8, maxLength: 200 },
            reason: { type: 'string', minLength: 2, maxLength: 500 },
          },
        },
      },
    },
    async (request, reply) => {
      const { name, ownerName, ownerPhone, username } = request.body;

      const existingUser = await prisma.user.findUnique({ where: { username }, select: { id: true } });
      if (existingUser) {
        return fail(reply, 409, 'USERNAME_TAKEN', 'اسم الدخول هذا مستخدم بالفعل.', 'That username is already in use.');
      }

      const slugBase = name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
      const slug = `${slugBase || 'center'}-${Math.random().toString(36).slice(2, 7)}`;

      const temporaryPassword = request.body.password ?? generateTemporaryPassword();
      const passwordHash = await argon2.hash(temporaryPassword, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      const created = await prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: name.trim(),
            searchName: normalizeArabicText(name),
            slug,
            ownerName: ownerName.trim(),
            ownerPhone,
            isActive: true,
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          },
        });

        const user = await tx.user.create({
          data: {
            tenantId: tenant.id,
            username,
            fullName: ownerName.trim(),
            searchName: normalizeArabicText(ownerName),
            phoneNumber: ownerPhone,
            email: null,
            passwordHash,
            role: Role.ADMIN,
            preferredLanguage: 'ar',
            isActive: true,
          },
          select: { id: true, username: true, fullName: true, role: true, phoneNumber: true, email: true, isActive: true },
        });

        await tx.room.create({
          data: { tenantId: tenant.id, name: 'قاعة ١ (الرئيسية)', capacity: 60, floor: 'الطابق الأول', isActive: true },
        });

        await recordSuperAdminAudit(
          {
            actorId: request.user.sub,
            tenantId: tenant.id,
            action: 'PLATFORM_TENANT_CREATED',
            entityType: 'Tenant',
            entityId: tenant.id,
            afterJson: { name: tenant.name, slug: tenant.slug, ownerUsername: user.username },
            reason: request.body.reason ?? null,
            ip: request.ip ?? null,
          },
          tx,
        );

        return { tenant, user };
      });

      return reply.code(201).send({
        success: true,
        data: {
          tenant: serializeTenant(created.tenant, new Date()),
          owner: created.user,
          temporaryPassword: request.body.password ? null : temporaryPassword,
        },
      });
    },
  );

  // ── GET /api/admin/tenants/:id — Center 360 ───────────────────────────
  app.get<{ Params: { id: string } }>(
    '/tenants/:id',
    { preHandler: SUPER_ADMIN_GATE },
    async (request, reply) => {
      const { id } = request.params;

      const tenant = await prisma.tenant.findUnique({
        where: { id },
        include: {
          _count: { select: { users: true, students: true, teachers: true, sessions: true, rooms: true, attendances: true } },
        },
      });

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
      const [subscriptions, recentAudit, users, supportNotes, healthAlerts, adjustments, attendanceSummary] =
        await Promise.all([
          prisma.subscription.findMany({
            where: { tenantId: id },
            orderBy: { createdAt: 'desc' },
            take: 20,
          }),
          prisma.auditLog.findMany({
            where: { actor: { tenantId: id } },
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: { actor: { select: { username: true, fullName: true } } },
          }),
          prisma.user.findMany({
            where: { tenantId: id },
            orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
            take: 100,
            select: {
              id: true, username: true, fullName: true, role: true, email: true,
              phoneNumber: true, isActive: true, lastLoginAt: true, createdAt: true,
            },
          }),
          prisma.supportNote.findMany({
            where: { tenantId: id },
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: { author: { select: { id: true, fullName: true, username: true } } },
          }),
          prisma.systemHealthEvent.findMany({
            where: { tenantId: id, resolvedAt: null },
            orderBy: { createdAt: 'desc' },
            take: 20,
          }),
          prisma.subscriptionAdjustment.findMany({
            where: { tenantId: id },
            orderBy: { createdAt: 'desc' },
            take: 20,
            include: { createdBy: { select: { id: true, fullName: true, username: true } } },
          }),
          prisma.attendance.groupBy({
            by: ['status'],
            where: { session: { tenantId: id } },
            _count: { _all: true },
          }),
        ]);

      const usage = await computeUsageForTenants(
        [{
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          isActive: tenant.isActive,
          createdAt: tenant.createdAt,
        }],
        now,
      );

      return reply.send({
        success: true,
        data: {
          tenant: {
            ...serializeTenant(tenant, now),
            userCount: tenant._count.users,
            studentCount: tenant._count.students,
            teacherCount: tenant._count.teachers,
            sessionCount: tenant._count.sessions,
            roomCount: tenant._count.rooms,
            attendanceCount: tenant._count.attendances,
            attendancesByStatus: Object.fromEntries(
              attendanceSummary.map((row) => [row.status, row._count._all]),
            ) as Record<string, number>,
          },
          usage: usage[0] ?? null,
          users,
          supportNotes,
          healthAlerts,
          adjustments: adjustments.map((adjustment) => ({
            ...adjustment,
            amount: adjustment.amount.toString(),
          })),
          subscriptions: subscriptions.map((subscription) => ({
            ...subscription,
            amount: subscription.amount.toString(),
          })),
          recentAudit: recentAudit.map((entry) => ({
            ...entry,
            amount: entry.amount?.toString() ?? null,
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
        },
      });

      await recordSuperAdminAudit({
        actorId: request.user.sub,
        tenantId: id,
        action: 'TENANT_TRIAL_EXTENDED',
        entityType: 'Tenant',
        entityId: id,
        beforeJson: { trialEndsAt: tenant.trialEndsAt },
        afterJson: { trialEndsAt: updated.trialEndsAt, daysExtended: days },
        reason: null,
        ip: request.ip ?? null,
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

        await recordSuperAdminAudit({
          actorId: request.user.sub,
          tenantId: id,
          action: isActive ? 'TENANT_REACTIVATED' : 'TENANT_SUSPENDED',
          entityType: 'Tenant',
          entityId: id,
          beforeJson: { isActive: tenant.isActive },
          afterJson: { isActive: updated.isActive },
          reason: null,
          ip: request.ip ?? null,
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

  // ═══ GET /api/admin/console-stats  (Phase 2 console stats v2) ══════════════
  // Platform KPIs reading the per-tenant platform tables added in migration
  // 20260924000000_platform_models: support notes, system health,
  // system settings + live MRR/trial splits.
  app.get(
    '/console-stats',
    { preHandler: SUPER_ADMIN_GATE },
    async (_request, reply) => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const [
        totalTenants,
        activeTenants,
        trialTenants,
        suspendedTenants,
        newCentersThisMonth,
        subscriptionAgg,
        openSupportNotes,
        platformNotifications,
        openViewAsSessions,
        recentHealthEvents,
        pastDueSubscriptions,
        stalePendingSubscriptions,
        totalUsers,
        inactiveUsers,
        monthlyVisits,
        recentActivity,
        recentSupportNotes,
      ] = await Promise.all([
        prisma.tenant.count(),
        prisma.tenant.count({ where: { isActive: true } }),
        prisma.tenant.count({
          where: {
            isActive: true,
            trialEndsAt: { gt: now },
          },
        }),
        prisma.tenant.count({ where: { isActive: false } }),
        prisma.tenant.count({ where: { createdAt: { gte: monthStart } } }),
        prisma.subscription.aggregate({
          _sum: { amount: true },
          where: { status: 'ACTIVE', periodEnd: { gt: now } },
        }),
        prisma.supportNote.count({ where: { status: 'OPEN' } }),
        prisma.platformNotification.count(),
        prisma.superAdminSession.count({ where: { endedAt: null } }),
        prisma.systemHealthEvent.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { id: true, level: true, category: true, message: true, createdAt: true },
        }),
        prisma.subscription.count({ where: { status: 'PAST_DUE' } }),
        prisma.subscription.count({
          where: { status: 'PENDING', createdAt: { lt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000) } },
        }),
        prisma.user.count(),
        prisma.user.count({ where: { isActive: false } }),
        prisma.attendance.count({ where: { checkInTime: { gte: monthStart }, status: { not: 'VOID' } } }),
        prisma.superAdminAuditLog.findMany({
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: {
            id: true, action: true, entityType: true, entityId: true, createdAt: true,
            tenant: { select: { id: true, name: true } },
          },
        }),
        prisma.supportNote.findMany({
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: {
            id: true, status: true, createdAt: true,
            tenant: { select: { id: true, name: true } },
          },
        }),
      ]);

      const mrr = Number(subscriptionAgg._sum.amount ?? 0);
      const revenueThisMonth = Number(
        (
          await prisma.subscription.aggregate({
            _sum: { amount: true },
            where: { status: 'ACTIVE', periodStart: { gte: monthStart }, periodEnd: { gt: now } },
          })
        )._sum.amount ?? 0,
      );

      // Centers with the most recorded activity this period — the dashboard's
      // "needs attention" list.
      const limitCandidates = await prisma.tenant.findMany({
        where: { isActive: true },
        select: {
          id: true, name: true, slug: true, isActive: true, createdAt: true,
        },
      });
      const usageRows = await computeUsageForTenants(limitCandidates, now);
      const approachingLimits = usageRows
        .sort((a, b) => b.visitCount - a.visitCount)
        .slice(0, 5)
        .map((row) => ({
          tenantId: row.tenantId,
          centerName: limitCandidates.find((tenant) => tenant.id === row.tenantId)?.name ?? '',
          visitsThisPeriod: row.visitCount,
          receptionistCount: row.receptionistCount,
          metrics: row.metrics,
        }));

      return reply.send({
        success: true,
        data: {
          mrrEgp: mrr,
          revenueThisMonth,
          monthlyVisits,
          tenants: {
            total: totalTenants,
            active: activeTenants,
            trial: trialTenants,
            suspended: suspendedTenants,
            newThisMonth: newCentersThisMonth,
          },
          users: { total: totalUsers, inactive: inactiveUsers },
          billing: {
            pastDue: pastDueSubscriptions,
            stalePending: stalePendingSubscriptions,
          },
          approachingLimits,
          support: { openNotes: openSupportNotes, recentNotes: recentSupportNotes },
          notifications: { total: platformNotifications },
          viewAs: { openSessions: openViewAsSessions },
          recentHealthEvents,
          recentActivity,
        },
      });
    },
  );

  // ═══ POST /api/admin/tenants/:id/view-as  (View-as-Center start) ═══════════
  // Creates a SuperAdminSession impersonating the target center and returns an
  // impersonation JWT signed with the same secret, scoped to that center.
  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/tenants/:id/view-as',
    { preHandler: SUPER_ADMIN_GATE },
    async (request, reply) => {
      const { id } = request.params;
      const { reason } = request.body;

      const tenant = await prisma.tenant.findUnique({ where: { id } });
      if (!tenant) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'TENANT_NOT_FOUND',
            message: 'لم يتم العثور على المركز.',
            messageEn: 'Tenant not found.',
          },
        });
      }

      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

      const session = await prisma.superAdminSession.create({
        data: {
          adminUserId: request.user.sub,
          impersonatingTenantId: id,
          reason: reason ?? null,
          expiresAt,
        },
        select: { id: true, startedAt: true, expiresAt: true },
      });

      const token = await app.jwt.sign(
        {
          sub: request.user.sub,
          username: request.user.username,
          role: Role.ADMIN,
          tenantId: id,
        },
        { expiresIn: '30m' },
      );

      await recordSuperAdminAudit({
        actorId: request.user.sub,
        tenantId: id,
        action: 'VIEW_AS_CENTER_STARTED',
        entityType: 'SuperAdminSession',
        entityId: session.id,
        afterJson: { reason: reason ?? null, impersonatedTenantId: id, expiresAt: expiresAt.toISOString() },
        ip: request.ip ?? null,
      });

      return reply.send({
        success: true,
        data: {
          sessionId: session.id,
          token,
          expiresAt,
          tenant: { id: tenant.id, name: tenant.name, isActive: tenant.isActive },
        },
      });
    },
  );

  // ═══ POST /api/admin/view-as/return  (View-as-Center return) ═══════════════
  // Ends the current impersonation session opened by this super admin.
  app.post<{ Body: { sessionId: string } }>(
    '/view-as/return',
    { preHandler: SUPER_ADMIN_GATE },
    async (request, reply) => {
      const { sessionId } = request.body;

      const session = await prisma.superAdminSession.findUnique({
        where: { id: sessionId },
      });
      if (!session) {
        return reply.code(404).send({
          success: false,
          error: {
            code: 'SESSION_NOT_FOUND',
            message: 'لم يتم العثور على الجلسة.',
            messageEn: 'Session not found.',
          },
        });
      }

      if (session.adminUserId !== request.user.sub || session.endedAt) {
        return reply.code(409).send({
          success: false,
          error: {
            code: 'SESSION_NOT_ACTIVE',
            message: 'الجلسة غير نشطة.',
            messageEn: 'Session is not active.',
          },
        });
      }

      const ended = await prisma.superAdminSession.update({
        where: { id: sessionId },
        data: { endedAt: new Date() },
        select: { id: true, endedAt: true },
      });

      await recordSuperAdminAudit({
        actorId: request.user.sub,
        tenantId: session.impersonatingTenantId ?? null,
        action: 'VIEW_AS_CENTER_RETURNED',
        entityType: 'SuperAdminSession',
        entityId: sessionId,
        afterJson: { endedAt: ended.endedAt?.toISOString() ?? null },
        ip: request.ip ?? null,
      });

      return reply.send({ success: true, data: ended });
    },
  );
};

export default adminRoutes;
