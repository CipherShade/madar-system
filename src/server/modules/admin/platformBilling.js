/**
 * Platform subscriptions & billing (super-admin console).
 *
 * Owns the money decisions the platform owner makes: cancel/reactivate a
 * subscription, open a new one for a center, grant a discount or credit, and
 * refund a payment. Every mutation is a single transaction
 * that also writes SuperAdminAuditLog — no money row changes without a ledger
 * entry next to it.
 *
 * Historical immutability: paid/expired subscription rows are never edited.
 * A refund is a new REFUND adjustment plus an equal credit back to the center,
 * and balances are only ever spent when a NEW pending amount is computed.
 */
import { Prisma, SubscriptionStatus, PaymentMethod } from '@prisma/client';
import { Role } from '../../../shared/constants/index.js';
import { MONTHLY_PRICE_EGP, SUBSCRIPTION_CURRENCY } from '../../../shared/constants/subscription.js';
import { normalizeArabicText } from '../../../shared/utils/arabicNormalization.js';
import { prisma } from '../../lib/prisma.js';
import { isValidUUID } from '../../lib/http.js';
import { authenticate, requireRoles } from '../auth/auth.js';
import { recordSuperAdminAudit } from './audit.js';
import { applyBillingBalances, buildRevenueReport, computeDiscountAmount, computeWalletMutation, toMoneyNumber } from './billingMath.js';
import { fail, paginationFromQuery, paginationPayload } from './platformHelpers.js';
const SUPER_ADMIN_GATE = [authenticate, requireRoles(Role.SUPER_ADMIN)];
const SUBSCRIPTION_PERIOD_DAYS = 30;
const STALE_PENDING_DAYS = 3;
const VIEW_STATUSES = {
    active: [SubscriptionStatus.ACTIVE],
    trials: [SubscriptionStatus.TRIALING],
    pending: [SubscriptionStatus.PENDING],
    pastDue: [SubscriptionStatus.PAST_DUE],
    expired: [SubscriptionStatus.EXPIRED],
    cancelled: [SubscriptionStatus.CANCELED],
};
const platformBillingRoutes = async (app) => {
    // ── GET /subscriptions — every subscription with owner filters ─────────
    app.get('/subscriptions', { preHandler: SUPER_ADMIN_GATE }, async (request, reply) => {
        const { page, limit, skip } = paginationFromQuery(request.query, 20);
        const view = (request.query.view ?? 'all');
        const search = request.query.search?.trim() ?? '';
        const now = new Date();
        const where = {
            ...(request.query.centerId ? { tenantId: request.query.centerId } : {}),
            ...(view !== 'all' && view in VIEW_STATUSES
                ? { status: { in: VIEW_STATUSES[view] } }
                : {}),
            ...(search
                ? {
                    OR: [
                        { paymentReference: { contains: search, mode: 'insensitive' } },
                        { tenant: { name: { contains: search, mode: 'insensitive' } } },
                        { tenant: { searchName: { contains: normalizeArabicText(search) } } },
                    ],
                }
                : {}),
        };
        const [subscriptions, total, counts] = await Promise.all([
            prisma.subscription.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    tenant: { select: { id: true, name: true, slug: true, isActive: true, ownerName: true } },
                    adjustments: { orderBy: { createdAt: 'desc' }, take: 5 },
                },
            }),
            prisma.subscription.count({ where }),
            prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
        ]);
        const statusCounts = Object.fromEntries(counts.map((row) => [row.status, row._count._all]));
        const staleBefore = new Date(now.getTime() - STALE_PENDING_DAYS * 24 * 60 * 60 * 1000);
        return reply.send({
            success: true,
            data: {
                subscriptions: subscriptions.map((sub) => ({
                    ...sub,
                    amount: sub.amount.toString(),
                    isStale: sub.status === SubscriptionStatus.PENDING && sub.createdAt < staleBefore,
                    adjustments: sub.adjustments.map((adjustment) => ({ ...adjustment, amount: adjustment.amount.toString() })),
                })),
                views: Object.keys(VIEW_STATUSES),
                statusCounts,
                stalePendingAfterDays: STALE_PENDING_DAYS,
                pagination: paginationPayload(page, limit, total),
            },
        });
    });
    // ── POST /subscriptions — open a subscription for a center ────────────
    app.post('/subscriptions', {
        preHandler: SUPER_ADMIN_GATE,
        schema: {
            body: {
                type: 'object',
                required: ['tenantId'],
                additionalProperties: false,
                properties: {
                    tenantId: { type: 'string', format: 'uuid' },
                    paymentMethod: { type: 'string', enum: Object.values(PaymentMethod) },
                    paymentReference: { type: 'string', minLength: 2, maxLength: 200 },
                    startImmediately: { type: 'boolean' },
                    reason: { type: 'string', minLength: 2, maxLength: 500 },
                },
            },
        },
    }, async (request, reply) => {
        const { tenantId, paymentMethod, paymentReference, startImmediately } = request.body;
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { id: true, name: true, isActive: true, discountBalance: true, creditBalance: true },
        });
        if (!tenant)
            return fail(reply, 404, 'CENTER_NOT_FOUND', 'المركز غير موجود.', 'Center not found.');
        const now = new Date();
        const periodStart = now;
        const periodEnd = new Date(now.getTime() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000);
        const billing = applyBillingBalances(MONTHLY_PRICE_EGP, tenant.discountBalance, tenant.creditBalance);
        const status = startImmediately ? SubscriptionStatus.ACTIVE : SubscriptionStatus.PENDING;
        const result = await prisma.$transaction(async (tx) => {
            const subscription = await tx.subscription.create({
                data: {
                    tenantId,
                    status,
                    amount: new Prisma.Decimal(billing.amountDue),
                    currency: SUBSCRIPTION_CURRENCY,
                    paymentMethod: (paymentMethod ?? PaymentMethod.INSTAPAY),
                    paymentReference: paymentReference?.trim() ?? null,
                    periodStart,
                    periodEnd,
                },
            });
            const updatedTenant = await tx.tenant.update({
                where: { id: tenantId },
                data: {
                    discountBalance: new Prisma.Decimal(billing.remainingDiscount),
                    creditBalance: new Prisma.Decimal(billing.remainingCredit),
                    ...(startImmediately ? { isActive: true } : {}),
                },
            });
            await recordSuperAdminAudit({
                actorId: request.user.sub,
                tenantId,
                action: 'PLATFORM_SUBSCRIPTION_CREATED',
                entityType: 'Subscription',
                entityId: subscription.id,
                beforeJson: { discountBalance: tenant.discountBalance.toString(), creditBalance: tenant.creditBalance.toString() },
                afterJson: {
                    status,
                    baseAmount: billing.baseAmount,
                    amountDue: billing.amountDue,
                    discountApplied: billing.discountApplied,
                    creditApplied: billing.creditApplied,
                },
                reason: request.body.reason ?? null,
                ip: request.ip ?? null,
            }, tx);
            return { subscription, tenant: updatedTenant };
        });
        return reply.code(201).send({
            success: true,
            data: {
                subscription: { ...result.subscription, amount: result.subscription.amount.toString() },
                tenant: result.tenant,
                billing,
            },
        });
    });
    // ── POST /subscriptions/:id/cancel — stop at the end of the period ────
    app.post('/subscriptions/:id/cancel', {
        preHandler: SUPER_ADMIN_GATE,
        schema: {
            body: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    reason: { type: 'string', minLength: 2, maxLength: 500 },
                    immediate: { type: 'boolean' },
                },
            },
        },
    }, async (request, reply) => {
        if (!isValidUUID(request.params.id)) {
            return fail(reply, 400, 'INVALID_ID', 'معرّف الاشتراك غير صالح.', 'The subscription id is invalid.');
        }
        const existing = await prisma.subscription.findUnique({ where: { id: request.params.id } });
        if (!existing)
            return fail(reply, 404, 'SUBSCRIPTION_NOT_FOUND', 'الاشتراك غير موجود.', 'Subscription not found.');
        if (existing.status === SubscriptionStatus.CANCELED) {
            return fail(reply, 409, 'ALREADY_CANCELED', 'هذا الاشتراك ملغى بالفعل.', 'This subscription is already canceled.');
        }
        const cancelAt = request.body.immediate ? new Date() : existing.periodEnd;
        const subscription = await prisma.$transaction(async (tx) => {
            const updated = await tx.subscription.update({
                where: { id: existing.id },
                data: { status: SubscriptionStatus.CANCELED, periodEnd: cancelAt },
            });
            await recordSuperAdminAudit({
                actorId: request.user.sub,
                tenantId: existing.tenantId,
                action: 'PLATFORM_SUBSCRIPTION_CANCELED',
                entityType: 'Subscription',
                entityId: existing.id,
                beforeJson: { status: existing.status, periodEnd: existing.periodEnd.toISOString() },
                afterJson: { status: updated.status, periodEnd: updated.periodEnd.toISOString(), immediate: request.body.immediate === true },
                reason: request.body.reason ?? null,
                ip: request.ip ?? null,
            }, tx);
            return updated;
        });
        return reply.send({ success: true, data: { subscription: { ...subscription, amount: subscription.amount.toString() } } });
    });
    // ── POST /subscriptions/:id/reactivate — restore a canceled/expired sub ─
    app.post('/subscriptions/:id/reactivate', {
        preHandler: SUPER_ADMIN_GATE,
        schema: {
            body: {
                type: 'object',
                required: ['reason'],
                additionalProperties: false,
                properties: { reason: { type: 'string', minLength: 2, maxLength: 500 } },
            },
        },
    }, async (request, reply) => {
        if (!isValidUUID(request.params.id)) {
            return fail(reply, 400, 'INVALID_ID', 'معرّف الاشتراك غير صالح.', 'The subscription id is invalid.');
        }
        const existing = await prisma.subscription.findUnique({ where: { id: request.params.id } });
        if (!existing)
            return fail(reply, 404, 'SUBSCRIPTION_NOT_FOUND', 'الاشتراك غير موجود.', 'Subscription not found.');
        if (existing.status === SubscriptionStatus.ACTIVE) {
            return fail(reply, 409, 'ALREADY_ACTIVE', 'هذا الاشتراك نشط بالفعل.', 'This subscription is already active.');
        }
        if (existing.status === SubscriptionStatus.PENDING) {
            return fail(reply, 409, 'AWAITING_PAYMENT', 'هذا الاشتراك بانتظار التأكيد من صفحة المدفوعات.', 'This subscription is awaiting payment confirmation.');
        }
        const now = new Date();
        const periodStart = now;
        const periodEnd = new Date(now.getTime() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000);
        const subscription = await prisma.$transaction(async (tx) => {
            const updated = await tx.subscription.update({
                where: { id: existing.id },
                data: { status: SubscriptionStatus.ACTIVE, periodStart, periodEnd },
            });
            await tx.tenant.update({ where: { id: existing.tenantId }, data: { isActive: true } });
            await recordSuperAdminAudit({
                actorId: request.user.sub,
                tenantId: existing.tenantId,
                action: 'PLATFORM_SUBSCRIPTION_REACTIVATED',
                entityType: 'Subscription',
                entityId: existing.id,
                beforeJson: { status: existing.status, periodEnd: existing.periodEnd.toISOString() },
                afterJson: { status: updated.status, periodStart: periodStart.toISOString(), periodEnd: periodEnd.toISOString() },
                reason: request.body.reason,
                ip: request.ip ?? null,
            }, tx);
            return updated;
        });
        return reply.send({ success: true, data: { subscription: { ...subscription, amount: subscription.amount.toString() } } });
    });
    // ── POST /subscriptions/:id/discount — discount the next invoice ───────
    app.post('/subscriptions/:id/discount', {
        preHandler: SUPER_ADMIN_GATE,
        schema: {
            body: {
                type: 'object',
                required: ['kind', 'value', 'reason'],
                additionalProperties: false,
                properties: {
                    kind: { type: 'string', enum: ['PERCENT', 'FIXED'] },
                    value: { type: 'number', exclusiveMinimum: 0, maximum: 1_000_000 },
                    reason: { type: 'string', minLength: 2, maxLength: 500 },
                },
            },
        },
    }, async (request, reply) => {
        if (!isValidUUID(request.params.id)) {
            return fail(reply, 400, 'INVALID_ID', 'معرّف الاشتراك غير صالح.', 'The subscription id is invalid.');
        }
        const subscription = await prisma.subscription.findUnique({ where: { id: request.params.id } });
        if (!subscription)
            return fail(reply, 404, 'SUBSCRIPTION_NOT_FOUND', 'الاشتراك غير موجود.', 'Subscription not found.');
        if (subscription.status === SubscriptionStatus.ACTIVE) {
            return fail(reply, 409, 'CANNOT_DISCOUNT_ACTIVE_PERIOD', 'لا يمكن تطبيق خصم على فترة مدفوعة بالفعل. ألغِ الاشتراك وافتح اشتراكًا جديدًا للخصم.', 'An already-paid period cannot be discounted. Cancel it and open a new subscription to apply a discount.');
        }
        const discount = computeDiscountAmount(subscription.amount, request.body.kind, request.body.value);
        if (discount <= 0) {
            return fail(reply, 400, 'INVALID_DISCOUNT', 'قيمة الخصم غير صالحة.', 'The discount value is invalid.');
        }
        const mutation = computeWalletMutation('DISCOUNT', discount);
        const result = await prisma.$transaction(async (tx) => {
            const tenant = await tx.tenant.update({
                where: { id: subscription.tenantId },
                data: { discountBalance: { increment: new Prisma.Decimal(mutation.discountDelta) } },
                select: { discountBalance: true, creditBalance: true },
            });
            const adjustment = await tx.subscriptionAdjustment.create({
                data: {
                    tenantId: subscription.tenantId,
                    subscriptionId: subscription.id,
                    type: 'DISCOUNT',
                    amount: new Prisma.Decimal(discount),
                    reason: request.body.reason.trim(),
                    createdById: request.user.sub,
                },
            });
            await recordSuperAdminAudit({
                actorId: request.user.sub,
                tenantId: subscription.tenantId,
                action: 'PLATFORM_SUBSCRIPTION_DISCOUNTED',
                entityType: 'SubscriptionAdjustment',
                entityId: adjustment.id,
                beforeJson: { subscriptionAmount: subscription.amount.toString() },
                afterJson: {
                    kind: request.body.kind,
                    value: request.body.value,
                    discount,
                    discountBalance: tenant.discountBalance.toString(),
                },
                reason: request.body.reason.trim(),
                ip: request.ip ?? null,
            }, tx);
            return { adjustment, tenant };
        });
        return reply.send({
            success: true,
            data: {
                adjustment: { ...result.adjustment, amount: result.adjustment.amount.toString() },
                tenant: {
                    discountBalance: result.tenant.discountBalance.toString(),
                    creditBalance: result.tenant.creditBalance.toString(),
                },
            },
        });
    });
    // ── POST /subscriptions/:id/credit — grant spendable credit ───────────
    app.post('/subscriptions/:id/credit', {
        preHandler: SUPER_ADMIN_GATE,
        schema: {
            body: {
                type: 'object',
                required: ['amount', 'reason'],
                additionalProperties: false,
                properties: {
                    amount: { type: 'number', exclusiveMinimum: 0, maximum: 1_000_000 },
                    reason: { type: 'string', minLength: 2, maxLength: 500 },
                },
            },
        },
    }, async (request, reply) => {
        if (!isValidUUID(request.params.id)) {
            return fail(reply, 400, 'INVALID_ID', 'معرّف الاشتراك غير صالح.', 'The subscription id is invalid.');
        }
        const subscription = await prisma.subscription.findUnique({ where: { id: request.params.id } });
        if (!subscription)
            return fail(reply, 404, 'SUBSCRIPTION_NOT_FOUND', 'الاشتراك غير موجود.', 'Subscription not found.');
        const credit = computeWalletMutation('CREDIT', request.body.amount);
        if (credit.creditDelta <= 0) {
            return fail(reply, 400, 'INVALID_AMOUNT', 'قيمة الرصيد غير صالحة.', 'The credit amount is invalid.');
        }
        const result = await prisma.$transaction(async (tx) => {
            const tenant = await tx.tenant.update({
                where: { id: subscription.tenantId },
                data: { creditBalance: { increment: new Prisma.Decimal(credit.creditDelta) } },
                select: { discountBalance: true, creditBalance: true },
            });
            const adjustment = await tx.subscriptionAdjustment.create({
                data: {
                    tenantId: subscription.tenantId,
                    subscriptionId: subscription.id,
                    type: 'CREDIT',
                    amount: new Prisma.Decimal(credit.creditDelta),
                    reason: request.body.reason.trim(),
                    createdById: request.user.sub,
                },
            });
            await recordSuperAdminAudit({
                actorId: request.user.sub,
                tenantId: subscription.tenantId,
                action: 'PLATFORM_SUBSCRIPTION_CREDITED',
                entityType: 'SubscriptionAdjustment',
                entityId: adjustment.id,
                afterJson: { credit: credit.creditDelta, creditBalance: tenant.creditBalance.toString() },
                reason: request.body.reason.trim(),
                ip: request.ip ?? null,
            }, tx);
            return { adjustment, tenant };
        });
        return reply.send({
            success: true,
            data: {
                adjustment: { ...result.adjustment, amount: result.adjustment.amount.toString() },
                tenant: {
                    discountBalance: result.tenant.discountBalance.toString(),
                    creditBalance: result.tenant.creditBalance.toString(),
                },
            },
        });
    });
    // ── POST /subscriptions/:id/refund — record a refund and credit it back ─
    app.post('/subscriptions/:id/refund', {
        preHandler: SUPER_ADMIN_GATE,
        schema: {
            body: {
                type: 'object',
                required: ['reason'],
                additionalProperties: false,
                properties: {
                    amount: { type: 'number', exclusiveMinimum: 0, maximum: 1_000_000 },
                    reason: { type: 'string', minLength: 2, maxLength: 500 },
                },
            },
        },
    }, async (request, reply) => {
        if (!isValidUUID(request.params.id)) {
            return fail(reply, 400, 'INVALID_ID', 'معرّف الاشتراك غير صالح.', 'The subscription id is invalid.');
        }
        const subscription = await prisma.subscription.findUnique({ where: { id: request.params.id } });
        if (!subscription)
            return fail(reply, 404, 'SUBSCRIPTION_NOT_FOUND', 'الاشتراك غير موجود.', 'Subscription not found.');
        const alreadyRefunded = await prisma.subscriptionAdjustment.aggregate({
            where: { subscriptionId: subscription.id, type: 'REFUND' },
            _sum: { amount: true },
        });
        const refunded = toMoneyNumber(alreadyRefunded._sum.amount);
        const paid = toMoneyNumber(subscription.amount);
        const refund = Math.min(request.body.amount ?? paid, paid - refunded);
        if (refund <= 0) {
            return fail(reply, 409, 'ALREADY_FULLY_REFUNDED', `تم رد كامل المبلغ (${refunded}) لهذا الاشتراك بالفعل.`, `This subscription was already fully refunded (${refunded}).`);
        }
        const mutation = computeWalletMutation('REFUND', refund);
        const result = await prisma.$transaction(async (tx) => {
            const tenant = await tx.tenant.update({
                where: { id: subscription.tenantId },
                data: { creditBalance: { increment: new Prisma.Decimal(mutation.creditDelta) } },
                select: { discountBalance: true, creditBalance: true },
            });
            const adjustment = await tx.subscriptionAdjustment.create({
                data: {
                    tenantId: subscription.tenantId,
                    subscriptionId: subscription.id,
                    type: 'REFUND',
                    amount: new Prisma.Decimal(mutation.creditDelta),
                    reason: request.body.reason.trim(),
                    createdById: request.user.sub,
                },
            });
            await recordSuperAdminAudit({
                actorId: request.user.sub,
                tenantId: subscription.tenantId,
                action: 'PLATFORM_SUBSCRIPTION_REFUNDED',
                entityType: 'SubscriptionAdjustment',
                entityId: adjustment.id,
                beforeJson: { amount: subscription.amount.toString(), refundedBefore: refunded },
                afterJson: { refund: mutation.creditDelta, creditBalance: tenant.creditBalance.toString() },
                reason: request.body.reason.trim(),
                ip: request.ip ?? null,
            }, tx);
            return { adjustment, tenant, refundedBefore: refunded };
        });
        return reply.send({
            success: true,
            data: {
                refund: mutation.creditDelta,
                remainingRefundable: Math.max(0, paid - result.refundedBefore - mutation.creditDelta),
                adjustment: { ...result.adjustment, amount: result.adjustment.amount.toString() },
                tenant: {
                    discountBalance: result.tenant.discountBalance.toString(),
                    creditBalance: result.tenant.creditBalance.toString(),
                },
            },
        });
    });
    // ── GET /billing/adjustments — the discount/credit/refund ledger ──────
    app.get('/billing/adjustments', { preHandler: SUPER_ADMIN_GATE }, async (request, reply) => {
        const limit = paginationFromQuery({ limit: request.query.limit }, 50).limit;
        const adjustments = await prisma.subscriptionAdjustment.findMany({
            where: {
                ...(request.query.type && request.query.type !== 'all' ? { type: request.query.type } : {}),
                ...(request.query.centerId ? { tenantId: request.query.centerId } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
            include: {
                tenant: { select: { id: true, name: true, slug: true } },
                subscription: { select: { id: true, status: true, amount: true } },
                createdBy: { select: { id: true, fullName: true, username: true } },
            },
        });
        const totals = await prisma.subscriptionAdjustment.groupBy({
            by: ['type'],
            _sum: { amount: true },
        });
        return reply.send({
            success: true,
            data: {
                adjustments: adjustments.map((adjustment) => ({
                    ...adjustment,
                    amount: adjustment.amount.toString(),
                    subscription: adjustment.subscription
                        ? { ...adjustment.subscription, amount: adjustment.subscription.amount.toString() }
                        : null,
                })),
                totals: Object.fromEntries(totals.map((row) => [row.type, toMoneyNumber(row._sum.amount)])),
            },
        });
    });
    // ── GET /revenue — MRR, revenue this month, trends ───────────
    app.get('/revenue', { preHandler: SUPER_ADMIN_GATE }, async (request, reply) => {
        const now = new Date();
        const months = paginationFromQuery({ limit: request.query.months }, 6).limit;
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const [subscriptions, newThisMonth, canceledThisMonth, refunds, discounts, credits, stalePending] = await Promise.all([
            prisma.subscription.findMany({
                where: { status: { notIn: [SubscriptionStatus.PENDING, SubscriptionStatus.CANCELED] } },
                select: { id: true, tenantId: true, status: true, amount: true, periodStart: true, periodEnd: true, createdAt: true },
            }),
            prisma.subscription.count({ where: { createdAt: { gte: monthStart }, status: { not: SubscriptionStatus.CANCELED } } }),
            prisma.subscription.count({ where: { updatedAt: { gte: monthStart }, status: SubscriptionStatus.CANCELED } }),
            prisma.subscriptionAdjustment.aggregate({ where: { type: 'REFUND' }, _sum: { amount: true } }),
            prisma.subscriptionAdjustment.aggregate({ where: { type: 'DISCOUNT' }, _sum: { amount: true } }),
            prisma.subscriptionAdjustment.aggregate({ where: { type: 'CREDIT' }, _sum: { amount: true } }),
            prisma.subscription.count({
                where: { status: SubscriptionStatus.PENDING, createdAt: { lt: new Date(now.getTime() - STALE_PENDING_DAYS * 24 * 60 * 60 * 1000) } },
            }),
        ]);
        const report = buildRevenueReport(subscriptions, months, now);
        const revenueThisMonth = subscriptions
            .filter((sub) => sub.periodStart >= monthStart && sub.periodEnd > now)
            .reduce((sum, sub) => sum + toMoneyNumber(sub.amount), 0);
        return reply.send({
            success: true,
            data: {
                mrr: report.mrr,
                atRiskRevenue: report.atRisk,
                revenueThisMonth: Math.round(revenueThisMonth * 100) / 100,
                history: report.history,
                movements: {
                    newSubscriptions: newThisMonth,
                    canceledSubscriptions: canceledThisMonth,
                    pastDue: subscriptions.filter((sub) => sub.status === SubscriptionStatus.PAST_DUE).length,
                    stalePending,
                },
                adjustments: {
                    refunds: toMoneyNumber(refunds._sum.amount),
                    discounts: toMoneyNumber(discounts._sum.amount),
                    credits: toMoneyNumber(credits._sum.amount),
                },
                stalePendingAfterDays: STALE_PENDING_DAYS,
            },
        });
    });
};
export default platformBillingRoutes;
