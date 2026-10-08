import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { AttendanceStatus, PaymentMethod, Role, SessionStatus, SettlementStatus, ShiftStatus } from '../../../shared/constants/index.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requireRoles } from '../auth/auth.js';
import { requireTenantWritable } from '../../lib/tenantLifecycle.js';
import { recordAuditEntry } from '../reports/audit.js';
import { isValidUUID } from '../../lib/http.js';

export function calculateSessionSettlement(input: {
  reconciledHeadcount: number;
  sessionPrice: number;
  centerFeePerStudent: number;
}) {
  const totalRevenue = Number((input.reconciledHeadcount * input.sessionPrice).toFixed(2));
  const centerShare = Number((input.reconciledHeadcount * input.centerFeePerStudent).toFixed(2));
  const teacherPayout = Number((totalRevenue - centerShare).toFixed(2));

  return {
    totalRevenue,
    centerShare,
    teacherPayout,
  };
}

type SettlementBody = {
  payoutMethod: PaymentMethod;
  recipientName: string;
};

function validation(message: string, messageEn: string, code = 'VALIDATION_ERROR') {
  return { success: false, error: { code, message, messageEn } };
}

const settlementRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string } }>('/sessions/:id/settlement-preview', {
    preHandler: [authenticate, requireRoles(Role.ADMIN, Role.RECEPTIONIST)],
  }, async (request, reply) => {
    if (!isValidUUID(request.params.id)) {
      return reply.code(400).send(validation('معرّف الحصة غير صالح.', 'The session id is invalid.'));
    }
    const tenantId = request.user.tenantId;
    if (!tenantId) {
      return reply.code(400).send(validation('الحساب غير مرتبط بمركز تعليمي.', 'Account has no tenant assigned.', 'TENANT_REQUIRED'));
    }
    const session = await prisma.session.findFirst({
      where: { id: request.params.id, tenantId },
      select: { sessionPrice: true, centerFeePerStudent: true },
    });
    if (!session) {
      return reply.code(404).send(validation('الحصة غير موجودة.', 'Session not found.', 'SESSION_NOT_FOUND'));
    }
    const [reconciliation, lobbyCount] = await Promise.all([
      prisma.sessionReconciliation.findFirst({ where: { sessionId: request.params.id, tenantId }, select: { reconciledHeadcount: true } }),
      prisma.attendance.count({ where: { sessionId: request.params.id, tenantId, status: { not: AttendanceStatus.VOID } } }),
    ]);
    const headcount = reconciliation?.reconciledHeadcount ?? lobbyCount;
    const values = calculateSessionSettlement({
      reconciledHeadcount: headcount,
      sessionPrice: Number(session.sessionPrice),
      centerFeePerStudent: Number(session.centerFeePerStudent),
    });
    return reply.send({
      success: true,
      data: {
        reconciled: reconciliation !== null,
        headcount,
        sessionPrice: Number(session.sessionPrice),
        centerFeePerStudent: Number(session.centerFeePerStudent),
        totalRevenue: values.totalRevenue,
        centerShare: values.centerShare,
        teacherPayout: values.teacherPayout,
      },
    });
  });

  app.post<{ Params: { id: string }; Body: SettlementBody }>('/sessions/:id/settle', {
    preHandler: [authenticate, requireRoles(Role.ADMIN, Role.RECEPTIONIST), app.rateLimit.financial, requireTenantWritable],
    schema: {
      body: {
        type: 'object',
        required: ['payoutMethod', 'recipientName'],
        additionalProperties: false,
        properties: {
          payoutMethod: { type: 'string', enum: Object.values(PaymentMethod) },
          recipientName: { type: 'string', minLength: 3, maxLength: 100 },
        },
      },
    },
  }, async (request, reply) => {
    if (!isValidUUID(request.params.id)) {
      return reply.code(400).send(validation('معرّف الحصة غير صالح.', 'The session id is invalid.'));
    }
    const tenantId = request.user.tenantId;
    if (!tenantId) {
      return reply.code(400).send(validation('الحساب غير مرتبط بمركز تعليمي.', 'Account has no tenant assigned.', 'TENANT_REQUIRED'));
    }
    // Scoped by center: settling pays a teacher out of the caller's own shift
    // drawer and then locks the session COMPLETED. Without the scope one center
    // could pay out and lock another center's session, and the payout would be
    // recorded against the caller's tenant while the revenue belonged to someone
    // else.
    const session = await prisma.session.findFirst({
      where: { id: request.params.id, tenantId },
      include: { teacher: true, reconciliation: true },
    });

    if (!session) {
      return reply.code(404).send(validation('الحصة غير موجودة.', 'Session not found.', 'SESSION_NOT_FOUND'));
    }

    if (session.status === SessionStatus.COMPLETED) {
      return reply.code(409).send(validation('الحصة تم تسويتها بالفعل.', 'This session is already completed.', 'SESSION_LOCKED'));
    }

    if (session.status === SessionStatus.CANCELLED) {
      return reply.code(409).send(validation('لا يمكن صرف مستحقات حصة ملغاة — لم تُعقد أصلاً.', 'A cancelled session was never held and cannot be settled.', 'SESSION_LOCKED'));
    }

    if (!session.reconciliation) {
      return reply.code(400).send(validation('يجب إتمام مطابقة الأعداد قبل التسوية.', 'The session must be reconciled before settlement.', 'RECONCILIATION_REQUIRED'));
    }
    const reconciliation = session.reconciliation;

    const activeShift = await prisma.shiftRegister.findFirst({
      where: { receptionistId: request.user.sub, tenantId, status: ShiftStatus.OPEN },
      orderBy: { openedAt: 'desc' },
    });

    if (!activeShift) {
      return reply.code(400).send(validation('يجب فتح وردية نشطة قبل صرف مستحقات المدرس.', 'An active shift is required before making a teacher payout.', 'SHIFT_NOT_OPEN'));
    }

    const settlementValues = calculateSessionSettlement({
      reconciledHeadcount: reconciliation.reconciledHeadcount,
      sessionPrice: Number(session.sessionPrice),
      centerFeePerStudent: Number(session.centerFeePerStudent),
    });

    let settlement;
    try {
      settlement = await prisma.$transaction(async (transaction) => {
        const currentSession = await transaction.session.findFirst({ where: { id: session.id, tenantId }, select: { status: true } });
        if (!currentSession || currentSession.status === SessionStatus.COMPLETED || currentSession.status === SessionStatus.CANCELLED) throw new Error('SESSION_LOCKED');
        const currentShift = await transaction.shiftRegister.findFirst({ where: { id: activeShift.id, tenantId }, select: { status: true } });
        if (!currentShift || currentShift.status !== ShiftStatus.OPEN) throw new Error('SHIFT_CLOSED');
        const createdSettlement = await transaction.sessionSettlement.create({
          data: {
            sessionId: session.id,
            // Owned by the center, not orphaned: /api/reports/daily filters
            // settlements by tenantId, so a null here silently zeroes a center's
            // revenue and payout totals while the payout still left the drawer.
            tenantId,
            reconciliationId: reconciliation.id,
            disbursedFromShiftId: activeShift.id,
            reconciledHeadcount: reconciliation.reconciledHeadcount,
            sessionPrice: new Prisma.Decimal(session.sessionPrice),
            centerFeePerStudent: new Prisma.Decimal(session.centerFeePerStudent),
            totalRevenue: new Prisma.Decimal(settlementValues.totalRevenue),
            centerRevenue: new Prisma.Decimal(settlementValues.centerShare),
            teacherPayout: new Prisma.Decimal(settlementValues.teacherPayout),
            payoutMethod: request.body.payoutMethod,
            recipientName: request.body.recipientName.trim(),
            createdById: request.user.sub,
            status: SettlementStatus.DISBURSED,
          },
        });
        await transaction.session.update({ where: { id: session.id, tenantId }, data: { status: SessionStatus.COMPLETED } });
        await recordAuditEntry({ actorId: request.user.sub, tenantId, shiftRegisterId: activeShift.id, action: 'TEACHER_PAYOUT', entityType: 'SESSION_SETTLEMENT', entityId: createdSettlement.id, amount: settlementValues.teacherPayout, metadata: { sessionId: session.id, recipientName: createdSettlement.recipientName, payoutMethod: createdSettlement.payoutMethod } }, transaction);
        return createdSettlement;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Error && error.message === 'SESSION_LOCKED') {
        return reply.code(409).send(validation('تغيّرت حالة الحصة أثناء التسوية — لم تُصرف أي مستحقات.', 'The session state changed during settlement; no payout was made.', 'SESSION_LOCKED'));
      }
      if (error instanceof Error && error.message === 'SHIFT_CLOSED') {
        return reply.code(409).send(validation('تم إغلاق الوردية أثناء التسوية — لم تُصرف أي مستحقات.', 'The shift was closed during settlement; no payout was made.', 'SHIFT_CLOSED'));
      }
      throw error;
    }

    return reply.code(201).send({
      success: true,
      data: {
        settlement: {
          id: settlement.id,
          sessionId: settlement.sessionId,
          reconciledHeadcount: settlement.reconciledHeadcount,
          sessionPrice: Number(settlement.sessionPrice),
          centerFeePerStudent: Number(settlement.centerFeePerStudent),
          totalRevenue: Number(settlement.totalRevenue),
          centerShare: Number(settlement.centerRevenue),
          teacherPayout: Number(settlement.teacherPayout),
          payoutMethod: settlement.payoutMethod,
          recipientName: settlement.recipientName,
          settledAt: settlement.settledAt.toISOString(),
          status: settlement.status,
          disbursedFromDesk: activeShift.deskIdentifier,
        },
      },
    });
  });
};

export default settlementRoutes;
