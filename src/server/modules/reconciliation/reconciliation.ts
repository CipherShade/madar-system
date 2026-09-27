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
    const session = await prisma.session.findUnique({ where: { id: request.params.id } });
    if (!session) {
      return reply.code(404).send(validation('الحصة غير موجودة.', 'Session not found.', 'SESSION_NOT_FOUND'));
    }
    if (session.status === SessionStatus.COMPLETED) {
      return reply.code(409).send(validation('لا يمكن تعديل مطابقة حصة منتهية.', 'A completed session cannot be reconciled again.', 'SESSION_LOCKED'));
    }

    const room = await prisma.room.findUnique({ where: { id: session.roomId }, select: { capacity: true } });
    const headcountCheck = validateReconciledHeadcount(request.body.reconciledHeadcount, room?.capacity ?? 0);
    if (!headcountCheck.ok) {
      return reply.code(400).send(validation(`العدد النهائي المعتمد لا يمكن أن يتجاوز سعة القاعة (${room?.capacity ?? 0}).`, headcountCheck.error, 'HEADCOUNT_EXCEEDS_CAPACITY'));
    }

    const lobbyCount = await prisma.attendance.count({ where: { sessionId: session.id, status: { not: 'VOID' } } });
    const reconcileInput = validateReconciliationInput({
      assistantCount: request.body.assistantCount,
      lobbyCount,
      resolutionNotes: request.body.resolutionNotes,
    });

    if (!reconcileInput.ok) {
      return reply.code(400).send(validation('يجب توضيح سبب اختلاف العدد النهائي مع عدد الاستقبال.', 'Resolution notes are required when the discrepancy is non-zero.', 'RECONCILIATION_REQUIRED'));
    }

    const reconciliation = await prisma.$transaction(async (transaction) => {
      const currentSession = await transaction.session.findUnique({ where: { id: session.id }, select: { status: true } });
      if (!currentSession || currentSession.status === SessionStatus.COMPLETED) throw new Error('SESSION_LOCKED');
      const currentLobbyCount = await transaction.attendance.count({ where: { sessionId: session.id, status: { not: 'VOID' } } });
      const currentDiscrepancy = computeDiscrepancy(request.body.assistantCount, currentLobbyCount);
      const record = await transaction.sessionReconciliation.upsert({
        where: { sessionId: session.id },
        update: { lobbyCount: currentLobbyCount, assistantCount: request.body.assistantCount, discrepancy: currentDiscrepancy, reconciledHeadcount: request.body.reconciledHeadcount, resolutionNotes: request.body.resolutionNotes?.trim() || null, reconciledById: request.user.sub, reconciledAt: new Date() },
        create: { sessionId: session.id, lobbyCount: currentLobbyCount, assistantCount: request.body.assistantCount, discrepancy: currentDiscrepancy, reconciledHeadcount: request.body.reconciledHeadcount, resolutionNotes: request.body.resolutionNotes?.trim() || null, reconciledById: request.user.sub },
      });
      await recordAuditEntry({
        actorId: request.user.sub,
        shiftRegisterId: null,
        action: 'SESSION_RECONCILED',
        entityType: 'SESSION_RECONCILIATION',
        entityId: record.id,
        metadata: { sessionId: session.id, lobbyCount: currentLobbyCount, assistantCount: request.body.assistantCount, discrepancy: currentDiscrepancy, reconciledHeadcount: request.body.reconciledHeadcount },
      }, transaction);
      return record;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

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
