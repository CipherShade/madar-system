import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { AttendanceStatus, PaymentMethod, Role, SubscriptionStatus, TenantPlan } from '../../../shared/constants/index.js';
import {
  PURCHASABLE_PLAN_IDS,
  computeVisitUsage,
  getPlanConfig,
} from '../../../shared/constants/plans.js';
import { prisma } from '../../lib/prisma.js';
import { isValidUUID } from '../../lib/http.js';
import { applyBillingBalances, verifiedEntitlements } from '../admin/billingMath.js';
import { authenticate, requireRoles } from '../auth/auth.js';
import { recordAuditEntry } from '../reports/audit.js';

type UpgradeBody = {
  plan: 'ESSENTIAL' | 'CONTROL';
  /** Upgrades are Instapay-only, matching the signup payment flow. */
  paymentMethod: PaymentMethod;
  /** The payer's Instapay account name (e.g. name@instapay), used as payment proof. */
  paymentReference: string;
};

const SUBSCRIPTION_PERIOD_DAYS = 30;
const SUBSCRIPTION_HISTORY_LIMIT = 10;

/**
 * The usage window is the current active subscription period, falling back to
 * the tenant's creation date when no paid period is running (trial / lapsed).
 * Exported for unit testing.
 */
export function resolveUsagePeriodStart(
  createdAt: Date,
  subscriptions: Array<{ status: string; periodStart: Date | string; periodEnd: Date | string }>,
  now: Date,
): Date {
  for (const sub of subscriptions) {
    if (sub.status === SubscriptionStatus.ACTIVE && new Date(sub.periodEnd).getTime() > now.getTime()) {
      return new Date(sub.periodStart);
    }
  }
  return createdAt;
}

/**
 * Where-clause for usage visit counting. One student check-in to one center
 * session = one visit. VOID attendances are never counted (they never count as
 * real visits) and only attendances recorded on or after the usage-period start
 * belong to the current billing window. Exported for unit testing so the
 * VOID-exclusion guarantee cannot drift.
 */
export function buildVisitCountWhere(periodStart: Date, tenantId: string) {
  return {
    checkInTime: { gte: periodStart },
    status: { not: AttendanceStatus.VOID },
    session: { tenantId },
  } as const;
}

const subscriptionRoutes: FastifyPluginAsync = async (app) => {
  app.get('/current', { preHandler: [authenticate, requireRoles(Role.ADMIN, Role.SUPER_ADMIN)] }, async (request, reply) => {
    const tenantId = request.user.tenantId;
    if (!tenantId) {
      return reply.code(400).send({
        success: false,
        error: { code: 'TENANT_REQUIRED', message: 'الحساب غير مرتبط بمركز تعليمي.', messageEn: 'Account has no tenant assigned.' },
      });
    }

    const [tenant, subscriptions] = await Promise.all([
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
          maxUsers: true,
          visitLimit: true,
          createdAt: true,
        },
      }),
      prisma.subscription.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: SUBSCRIPTION_HISTORY_LIMIT,
      }),
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

    const periodStart = resolveUsagePeriodStart(tenant.createdAt, subscriptions, now);
    const usedVisits = await prisma.attendance.count({
      where: buildVisitCountWhere(periodStart, tenantId),
    });

    return reply.send({
      success: true,
      data: {
        tenant,
        trialDaysRemaining,
        isTrialActive: tenant.trialEndsAt ? tenant.trialEndsAt > now : false,
        usage: {
          periodStart,
          visits: computeVisitUsage(usedVisits, tenant.visitLimit),
        },
        subscriptions: subscriptions.map((sub) => ({
          ...sub,
          amount: sub.amount.toString(),
        })),
      },
    });
  });

  app.post<{ Body: UpgradeBody }>('/upgrade', {
    preHandler: [authenticate, requireRoles(Role.ADMIN, Role.SUPER_ADMIN)],
    schema: {
      body: {
        type: 'object',
        required: ['plan', 'paymentMethod', 'paymentReference'],
        properties: {
          plan: { type: 'string', enum: PURCHASABLE_PLAN_IDS as string[] },
          paymentMethod: { type: 'string', enum: [PaymentMethod.INSTAPAY] },
          paymentReference: { type: 'string', pattern: '^[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+$', minLength: 3, maxLength: 100 },
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

    const selectedPlan = request.body.plan;
    if (!PURCHASABLE_PLAN_IDS.includes(selectedPlan)) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_PLAN', message: 'الباقة المختارة غير متاحة للترقية.', messageEn: 'The selected plan is not available for upgrade.' },
      });
    }

    const planConfig = getPlanConfig(selectedPlan);
    const baseAmount = planConfig.priceEgp ?? 0;
    const periodStart = new Date();
    const periodEnd = new Date(Date.now() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      // The invoice is priced against the tenant's wallets so the customer
      // knows exactly what to pay, but the wallets are NOT spent and the plan
      // is NOT granted here. Both happen in `verify`, which is the only place
      // a PENDING payment can become an entitlement.
      const tenantForWallet = await prisma.tenant.findUniqueOrThrow({
        where: { id: tenantId },
        select: { discountBalance: true, creditBalance: true },
      });
      const billing = applyBillingBalances(baseAmount, tenantForWallet.discountBalance, tenantForWallet.creditBalance);

      const subscription = await tx.subscription.create({
        data: {
          tenantId,
          plan: selectedPlan as TenantPlan,
          status: SubscriptionStatus.PENDING,
          amount: new Prisma.Decimal(billing.amountDue),
          currency: 'EGP',
          paymentMethod: request.body.paymentMethod,
          paymentReference: request.body.paymentReference.trim(),
          periodStart,
          periodEnd,
        },
      });

      await recordAuditEntry({
        actorId: request.user.sub,
        shiftRegisterId: null,
        action: 'SUBSCRIPTION_UPGRADED',
        entityType: 'SUBSCRIPTION',
        entityId: subscription.id,
        amount: billing.amountDue,
        metadata: {
          plan: selectedPlan,
          paymentMethod: request.body.paymentMethod,
          baseAmount: billing.baseAmount,
          discountApplied: billing.discountApplied,
          creditApplied: billing.creditApplied,
        },
      }, tx);

      return { subscription, tenant: await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }), billing };
    });

    return reply.send({
      success: true,
      data: {
        subscription: {
          ...result.subscription,
          amount: result.subscription.amount.toString(),
        },
        tenant: result.tenant,
        billing: result.billing,
      },
    });
  });

  // ── Super Admin: pending-payment verification queue ─────────────────────────
  //
  // Every INSTAPAY subscription is recorded as PENDING and grants no paid
  // entitlements. Verification is the ONLY transition that hands the purchased
  // plan to a tenant and spends its discount/credit wallets, so rejecting a
  // payment can never leave a center holding an unpaid plan.
  app.get('/pending', {
    preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)],
  }, async (_request, reply) => {
    const subscriptions = await prisma.subscription.findMany({
      where: { status: SubscriptionStatus.PENDING },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { tenant: { select: { id: true, name: true, slug: true, plan: true } } },
    });

    return reply.send({
      success: true,
      data: {
        subscriptions: subscriptions.map((sub) => ({
          id: sub.id,
          plan: sub.plan,
          amount: sub.amount.toString(),
          currency: sub.currency,
          paymentMethod: sub.paymentMethod,
          paymentReference: sub.paymentReference,
          createdAt: sub.createdAt,
          tenant: sub.tenant,
        })),
      },
    });
  });

  app.post<{ Params: { id: string } }>('/:id/verify', {
    preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)],
  }, async (request, reply) => {
    if (!isValidUUID(request.params.id)) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_ID', message: 'معرّف الاشتراك غير صالح.', messageEn: 'The subscription id is invalid.' },
      });
    }

    const subscription = await prisma.subscription.findUnique({ where: { id: request.params.id } });
    if (!subscription) {
      return reply.code(404).send({
        success: false,
        error: { code: 'SUBSCRIPTION_NOT_FOUND', message: 'الاشتراك غير موجود.', messageEn: 'Subscription not found.' },
      });
    }
    if (subscription.status !== SubscriptionStatus.PENDING) {
      return reply.code(409).send({
        success: false,
        error: { code: 'ALREADY_VERIFIED', message: 'هذا الاشتراك ليس قيد التأكيد.', messageEn: 'This subscription is not pending verification.' },
      });
    }

    const now = new Date();
    const periodStart = now;
    const periodEnd = new Date(now.getTime() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    const result = await prisma.$transaction(async (tx) => {
      // Entitlements are recomputed from the tenant's live wallet balances, so
      // a discount granted while the payment sat in the queue is applied here.
      const tenant = await tx.tenant.findUniqueOrThrow({
        where: { id: subscription.tenantId },
        select: { discountBalance: true, creditBalance: true },
      });
      const granted = verifiedEntitlements(subscription.plan, tenant.discountBalance, tenant.creditBalance);

      const updated = await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: SubscriptionStatus.ACTIVE, periodStart, periodEnd },
      });
      await tx.tenant.update({
        where: { id: subscription.tenantId },
        data: {
          plan: granted.plan as TenantPlan,
          isActive: granted.isActive,
          maxDesks: granted.limits.maxDesks,
          maxBranches: granted.limits.maxBranches,
          maxUsers: granted.limits.maxUsers,
          visitLimit: granted.limits.visitLimit,
          discountBalance: new Prisma.Decimal(granted.discountBalance),
          creditBalance: new Prisma.Decimal(granted.creditBalance),
        },
      });
      await recordAuditEntry({
        actorId: request.user.sub,
        shiftRegisterId: null,
        action: 'SUBSCRIPTION_VERIFIED',
        entityType: 'SUBSCRIPTION',
        entityId: subscription.id,
        amount: Number(subscription.amount),
        metadata: {
          plan: subscription.plan,
          paymentMethod: subscription.paymentMethod,
          paymentReference: subscription.paymentReference,
          // The invoice quoted at upgrade time vs. what the wallets actually
          // allowed at verification time — a gap means a wallet changed.
          invoicedAmount: subscription.amount.toString(),
          amountDue: granted.billing?.amountDue ?? null,
          discountApplied: granted.billing?.discountApplied ?? 0,
          creditApplied: granted.billing?.creditApplied ?? 0,
        },
      }, tx);
      return updated;
    });

    return reply.send({
      success: true,
      data: {
        subscription: { ...result, amount: result.amount.toString() },
      },
    });
  });

  app.post<{ Params: { id: string } }>('/:id/reject', {
    preHandler: [authenticate, requireRoles(Role.SUPER_ADMIN)],
  }, async (request, reply) => {
    if (!isValidUUID(request.params.id)) {
      return reply.code(400).send({
        success: false,
        error: { code: 'INVALID_ID', message: 'معرّف الاشتراك غير صالح.', messageEn: 'The subscription id is invalid.' },
      });
    }

    const subscription = await prisma.subscription.findUnique({ where: { id: request.params.id } });
    if (!subscription) {
      return reply.code(404).send({
        success: false,
        error: { code: 'SUBSCRIPTION_NOT_FOUND', message: 'الاشتراك غير موجود.', messageEn: 'Subscription not found.' },
      });
    }
    if (subscription.status !== SubscriptionStatus.PENDING) {
      return reply.code(409).send({
        success: false,
        error: { code: 'NOT_PENDING', message: 'هذا الاشتراك ليس قيد التأكيد.', messageEn: 'This subscription is not pending.' },
      });
    }

    // Nothing to unwind: the pending payment never granted a plan and never
    // spent a wallet, so the tenant simply keeps the entitlements it already
    // had (the trial tier at signup, or the current paid plan after a rejected
    // upgrade).
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.subscription.update({
        where: { id: subscription.id },
        data: { status: SubscriptionStatus.CANCELED, periodEnd: new Date() },
      });
      await recordAuditEntry({
        actorId: request.user.sub,
        shiftRegisterId: null,
        action: 'SUBSCRIPTION_REJECTED',
        entityType: 'SUBSCRIPTION',
        entityId: subscription.id,
        amount: Number(subscription.amount),
        metadata: { plan: subscription.plan, paymentReference: subscription.paymentReference },
      }, tx);
      return updated;
    });

    return reply.send({
      success: true,
      data: { subscription: { id: result.id, status: result.status } },
    });
  });
};

export default subscriptionRoutes;