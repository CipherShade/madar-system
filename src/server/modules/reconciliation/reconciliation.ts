import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { Role, SessionStatus } from '../../../shared/constants/index.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requireRoles } from '../auth/auth.js';
import { requireTenantWritable } from '../../lib/tenantLifecycle.js';
import { recordAuditEntry } from '../reports/audit.js';
import { isValidUUID } from '../../lib/http.js';

export function computeDiscrepancy(assistantCount: number, lobbyCount: number): number {
  return assistantCount - lobbyCount;
}

export function validateReconciliationInput(input: {
  assistantCount: number;
  lobbyCount: number;
  resolutionNotes?: string | null;
}): { ok: boolean; error?: string } {
  if (input.assistantCount < 0 || input.lobbyCount < 0) {
    return { ok: false, error: 'Counts cannot be negative.' };
  }

  const discrepancy = computeDiscrepancy(input.assistantCount, input.lobbyCount);
  if (discrepancy !== 0 && (!input.resolutionNotes || input.resolutionNotes.trim().length < 3)) {
    return { ok: false, error: 'Resolution notes are required when the discrepancy is non-zero.' };
  }

  return { ok: true };
}

export function validateReconciledHeadcount(headcount: number, capacity: number): { ok: true } | { ok: false; error: string } {
  if (headcount > capacity) {
    return { ok: false, error: `The reconciled headcount cannot exceed the room capacity (${capacity}).` };
  }
  return { ok: true };
}

/**
 * The payout multiplier may never exceed what either source actually counted.
 * lobbyCount is server-computed from check-ins; assistantCount is the human
 * count. A headcount above both is unbacked money leaving the drawer.
 */
export function validateReconciledHeadcountAgainstAttendance(
  reconciledHeadcount: number,
  lobbyCount: number,
  assistantCount: number,
): { ok: true } | { ok: false; error: string } {
  const ceiling = Math.max(lobbyCount, assistantCount);
  if (reconciledHeadcount > ceiling) {
    return {
      ok: false,
      error: `The reconciled headcount (${reconciledHeadcount}) cannot exceed the lobby count (${lobbyCount}) or the assistant count (${assistantCount}).`,
    };
  }
  return { ok: true };
}

type ReconciliationBody = {
  assistantCount: number;
  reconciledHeadcount: number;
  resolutionNotes?: string | null;
};

function validation(message: string, messageEn: string, code = 'VALIDATION_ERROR') {
  return { success: false, error: { code, message, messageEn } };
}

const reconciliationRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Params: { id: string }; Body: ReconciliationBody }>('/sessions/:id/reconcile', {
    preHandler: [authenticate, requireRoles(Role.ADMIN, Role.RECEPTIONIST), app.rateLimit.financial, requireTenantWritable],
    schema: {
      body: {
        type: 'object',
        required: ['assistantCount', 'reconciledHeadcount'],
        additionalProperties: false,
        properties: {
          assistantCount: { type: 'integer', minimum: 0, maximum: 10000 },
          reconciledHeadcount: { type: 'integer', minimum: 0, maximum: 10000 },
          resolutionNotes: { type: ['string', 'null'], maxLength: 2000 },
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
    // Scoped by center: reconciliation fixes the headcount a payout is computed
    // from, so another center's session must be indistinguishable from a missing
    // one. Attendance counts are scoped too, so a foreign row cannot inflate or
    // deflate this center's number.
    const session = await prisma.session.findFirst({ where: { id: request.params.id, tenantId } });
    if (!session) {
      return reply.code(404).send(validation('الحصة غير موجودة.', 'Session not found.', 'SESSION_NOT_FOUND'));
    }
    if (session.status === SessionStatus.COMPLETED) {
      return reply.code(409).send(validation('لا يمكن تعديل مطابقة حصة منتهية.', 'A completed session cannot be reconciled again.', 'SESSION_LOCKED'));
    }
    if (session.status === SessionStatus.CANCELLED) {
      return reply.code(409).send(validation('لا يمكن مطابقة حصة ملغاة — لم تُعقد أصلاً.', 'A cancelled session was never held and cannot be reconciled.', 'SESSION_LOCKED'));
    }

    const room = await prisma.room.findFirst({ where: { id: session.roomId, tenantId }, select: { capacity: true } });
    const headcountCheck = validateReconciledHeadcount(request.body.reconciledHeadcount, room?.capacity ?? 0);
    if (!headcountCheck.ok) {
      return reply.code(400).send(validation(`العدد النهائي المعتمد لا يمكن أن يتجاوز سعة القاعة (${room?.capacity ?? 0}).`, headcountCheck.error, 'HEADCOUNT_EXCEEDS_CAPACITY'));
    }

    const lobbyCount = await prisma.attendance.count({ where: { sessionId: session.id, tenantId, status: { not: 'VOID' } } });
    const attendanceBoundCheck = validateReconciledHeadcountAgainstAttendance(
      request.body.reconciledHeadcount,
      lobbyCount,
      request.body.assistantCount,
    );
    if (!attendanceBoundCheck.ok) {
      return reply.code(400).send(validation('العدد النهائي المعتمد لا يمكن أن يتجاوز عدد التسجيلات الفعلية أو عدد المساعد.', attendanceBoundCheck.error, 'HEADCOUNT_EXCEEDS_ATTENDANCE'));
    }
    const reconcileInput = validateReconciliationInput({
      assistantCount: request.body.assistantCount,
      lobbyCount,
      resolutionNotes: request.body.resolutionNotes,
    });

    if (!reconcileInput.ok) {
      return reply.code(400).send(validation('يجب توضيح سبب اختلاف العدد النهائي مع عدد الاستقبال.', 'Resolution notes are required when the discrepancy is non-zero.', 'RECONCILIATION_REQUIRED'));
    }

    let reconciliation;
    try {
      reconciliation = await prisma.$transaction(async (transaction) => {
        const currentSession = await transaction.session.findFirst({ where: { id: session.id, tenantId }, select: { status: true } });
        if (!currentSession || currentSession.status === SessionStatus.COMPLETED || currentSession.status === SessionStatus.CANCELLED) throw new Error('SESSION_LOCKED');
        const currentLobbyCount = await transaction.attendance.count({ where: { sessionId: session.id, tenantId, status: { not: 'VOID' } } });
        const currentBoundCheck = validateReconciledHeadcountAgainstAttendance(request.body.reconciledHeadcount, currentLobbyCount, request.body.assistantCount);
        if (!currentBoundCheck.ok) throw new Error('HEADCOUNT_EXCEEDS_ATTENDANCE');
        const currentDiscrepancy = computeDiscrepancy(request.body.assistantCount, currentLobbyCount);
        const record = await transaction.sessionReconciliation.upsert({
          where: { sessionId: session.id },
          update: { lobbyCount: currentLobbyCount, assistantCount: request.body.assistantCount, discrepancy: currentDiscrepancy, reconciledHeadcount: request.body.reconciledHeadcount, resolutionNotes: request.body.resolutionNotes?.trim() || null, reconciledById: request.user.sub, reconciledAt: new Date() },
          create: { sessionId: session.id, tenantId, lobbyCount: currentLobbyCount, assistantCount: request.body.assistantCount, discrepancy: currentDiscrepancy, reconciledHeadcount: request.body.reconciledHeadcount, resolutionNotes: request.body.resolutionNotes?.trim() || null, reconciledById: request.user.sub },
        });
        await recordAuditEntry({
          actorId: request.user.sub,
          tenantId,
          shiftRegisterId: null,
          action: 'SESSION_RECONCILED',
          entityType: 'SESSION_RECONCILIATION',
          entityId: record.id,
          metadata: { sessionId: session.id, lobbyCount: currentLobbyCount, assistantCount: request.body.assistantCount, discrepancy: currentDiscrepancy, reconciledHeadcount: request.body.reconciledHeadcount },
        }, transaction);
        return record;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (error instanceof Error && error.message === 'SESSION_LOCKED') {
        return reply.code(409).send(validation('تغيّرت حالة الحصة أثناء المطابقة — لم تُحفظ البيانات.', 'The session state changed during reconciliation; nothing was saved.', 'SESSION_LOCKED'));
      }
      if (error instanceof Error && error.message === 'HEADCOUNT_EXCEEDS_ATTENDANCE') {
        return reply.code(400).send(validation('العدد النهائي المعتمد يتجاوز عدد التسجيلات الفعلية أو عدد المساعد.', 'The reconciled headcount exceeds both the lobby count and the assistant count.', 'HEADCOUNT_EXCEEDS_ATTENDANCE'));
      }
      throw error;
    }

    return reply.send({
      success: true,
      data: {
        reconciliation: {
          id: reconciliation.id,
          sessionId: reconciliation.sessionId,
          lobbyCount: reconciliation.lobbyCount,
          assistantCount: reconciliation.assistantCount,
          discrepancy: reconciliation.discrepancy,
          reconciledHeadcount: reconciliation.reconciledHeadcount,
          resolutionNotes: reconciliation.resolutionNotes,
          reconciledBy: request.user.username,
          reconciledAt: reconciliation.reconciledAt.toISOString(),
        },
      },
    });
  });
};

export default reconciliationRoutes;
