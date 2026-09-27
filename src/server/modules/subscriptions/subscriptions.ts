import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { PaymentMethod, Role, TenantPlan, SubscriptionStatus } from '../../../shared/constants/index.js';
import { MADAR_PLANS, getPlanConfig } from '../../../shared/constants/plans.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requireRoles } from '../auth/auth.js';
import { recordAuditEntry } from '../reports/audit.js';
import { getTenantUsageSummary } from './usageService.js';

type UpgradeBody = {
  plan: 'BASIC' | 'GROWTH' | 'PRO' | 'MULTI_BRANCH' | 'BUSINESS';
  paymentMethod: PaymentMethod;
  paymentReference?: string | null;
};

const subscriptionRoutes: FastifyPluginAsync = async (app) => {
  // Public / Authenticated plans configuration endpoint
  app.get('/plans', async (_request, reply) => {
    return reply.send({
      success: true,
      data: {
        plans: Object.values(MADAR_PLANS),
      },
    });
  });

  // Current tenant subscription & usage details
  app.get('/current', { preHandler: [authenticate, requireRoles(Role.ADMIN, Role.SUPER_ADMIN)] }, async (request, reply) => {
    const tenantId = request.user.tenantId;
    if (!tenantId) {
      return reply.code(400).send({
        success: false,
        error: { code: 'TENANT_REQUIRED', message: 'الحساب غير مرتبط بمركز تعليمي.', messageEn: 'Account has no tenant assigned.' },
      });
    }

    const [tenant, subscriptions, usageSummary] = await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: {
          id: true,
          name: true,
          slug: true,
          plan: true,
          trialEndsAt: true,
          isActive: true,
          maxDesks: true,
          maxBranches: true,
          createdAt: true,
        },
      }),
      prisma.subscription.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      }),
      getTenantUsageSummary(tenantId).catch(() => null),
    ]);

    if (!tenant) {
      return reply.code(404).send({
        success: false,
        error: { code: 'TENANT_NOT_FOUND', message: 'المركز التعليمي غير موجود.', messageEn: 'Tenant not found.' },
      });
    }

    const now = new Date();
    const trialDaysRemaining = tenant.trialEndsAt
      ? Math.max(0, Math.ceil((new Date(tenant.trialEndsAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
      : 0;

    return reply.send({
      success: true,
      data: {
        tenant,
        trialDaysRemaining,
        isTrialActive: tenant.trialEndsAt ? tenant.trialEndsAt > now : false,
        usage: usageSummary,
        subscriptions: subscriptions.map((sub) => ({
          ...sub,
          amount: sub.amount.toString(),
        })),
      },
    });
  });

  // Upgrade or subscribe to a plan
  app.post<{ Body: UpgradeBody }>('/upgrade', {
    preHandler: [authenticate, requireRoles(Role.ADMIN, Role.SUPER_ADMIN)],
    schema: {
      body: {
        type: 'object',
        required: ['plan', 'paymentMethod'],
        properties: {
          plan: { type: 'string', enum: ['BASIC', 'GROWTH', 'PRO', 'MULTI_BRANCH', 'BUSINESS'] },
          paymentMethod: { type: 'string', enum: Object.values(PaymentMethod) },
          paymentReference: { type: ['string', 'null'], maxLength: 100 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const tenantId = request.user.tenantId;
    if (!tenantId) {
      return reply.code(400).send({
        success: false,
        error: { code: 'TENANT_REQUIRED', message: 'الحساب غير مرتبط بمركز تعليمي.', messageEn: 'Account has no tenant assigned.' },
      });
    }

    const requestedPlan = request.body.plan;
    const planConfig = getPlanConfig(requestedPlan);
    const amount = planConfig.priceEgp;
    const periodStart = new Date();
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days subscription

    // Map to DB TenantPlan enum
    let dbPlan: TenantPlan = TenantPlan.BASIC;
    if (planConfig.id === 'GROWTH') dbPlan = TenantPlan.GROWTH;
    else if (planConfig.id === 'PRO') dbPlan = TenantPlan.PRO;
    else if (planConfig.id === 'MULTI_BRANCH') dbPlan = TenantPlan.MULTI_BRANCH;

    const maxDesks = planConfig.maxReceptionists ?? 999;
    const maxBranches = planConfig.maxBranches ?? 99;

    const result = await prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          tenantId,
          plan: dbPlan,
          status: SubscriptionStatus.ACTIVE,
          amount: new Prisma.Decimal(amount),
          currency: 'EGP',
          paymentMethod: request.body.paymentMethod,
          paymentReference: request.body.paymentReference?.trim() || `PAY-${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
          periodStart,
          periodEnd,
        },
      });

      const updatedTenant = await tx.tenant.update({
        where: { id: tenantId },
        data: {
          plan: dbPlan,
          maxDesks,
          maxBranches,
        },
      });

      await recordAuditEntry({
        actorId: request.user.sub,
        shiftRegisterId: null,
        action: 'SUBSCRIPTION_UPGRADED',
        entityType: 'SUBSCRIPTION',
        entityId: subscription.id,
        amount,
        metadata: {
          plan: planConfig.id,
          planName: planConfig.name,
          paymentMethod: request.body.paymentMethod,
          priceEgp: amount,
        },
      }, tx);

      return { subscription, tenant: updatedTenant };
    });

    const updatedUsage = await getTenantUsageSummary(tenantId).catch(() => null);

    return reply.send({
      success: true,
      data: {
        subscription: {
          ...result.subscription,
          amount: result.subscription.amount.toString(),
        },
        tenant: result.tenant,
        usage: updatedUsage,
      },
    });
  });
};

export default subscriptionRoutes;
