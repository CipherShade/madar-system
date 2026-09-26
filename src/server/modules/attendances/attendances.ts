import type { FastifyPluginAsync } from 'fastify';
import { Prisma, PrismaClient } from '@prisma/client';
import { AttendanceStatus, PaymentMethod, Role, SessionStatus, ShiftStatus, SubscriptionStatus } from '../../../shared/constants/index.js';
import { prisma } from '../../lib/prisma.js';
import { buildLobbyAttendancePayload } from '../../lib/socket.js';
import { authenticate, requireRoles } from '../auth/auth.js';
import { recordAuditEntry } from '../reports/audit.js';
import { isValidMoneyAmount, isValidUUID, parsePagination } from '../../lib/http.js';
import { resolveUnpaidVisitGate } from '../admin/billingMath.js';
import { buildVisitCountWhere } from '../subscriptions/subscriptions.js';

export function calculateChangeOwed(amountReceived: number, fee: number): number {
  const change = amountReceived - fee;
  return change > 0 ? change : 0;
}

/** Remaining due on a check-in when the student paid less than the session price. */
export function calculateRemainingDue(amountPaid: number, fee: number): number {
  const remaining = fee - amountPaid;
  return remaining > 0 ? Number(remaining.toFixed(2)) : 0;
}

/** A check-in is partial when a positive amount was collected that still leaves a balance. */
export function isPartialPayment(amountPaid: number, fee: number): boolean {
  return amountPaid >= 0 && amountPaid < fee;
}

export function isSessionEligibleForLobbyDashboard(session: {
  status: string;
  startTime: Date;
  endTime: Date;
}): boolean {
  if (session.status === SessionStatus.ACTIVE) return true;

  if (session.status !== SessionStatus.SCHEDULED) return false;

  const minutesUntilStart = (session.startTime.getTime() - Date.now()) / (60 * 1000);
  return minutesUntilStart >= 0 && minutesUntilStart <= 30;
}

type AttendanceBody = {
  sessionId: string;
  studentId: string;
  paymentMethod: PaymentMethod;
  paymentReference?: string | null;
  amountPaid?: number;
};

const UUID_FORMAT = '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
const attendanceSchema = {
  type: 'object',
  required: ['sessionId', 'studentId', 'paymentMethod'],
  additionalProperties: false,
  properties: {
    sessionId: { type: 'string', pattern: UUID_FORMAT },
    studentId: { type: 'string', pattern: UUID_FORMAT },
    paymentMethod: { type: 'string', enum: Object.values(PaymentMethod) },
    paymentReference: { type: ['string', 'null'], minLength: 3, maxLength: 100 },
    amountPaid: { type: 'number', minimum: 0, maximum: 1000000 },
  },
} as const;

function validation(message: string, messageEn: string, code = 'VALIDATION_ERROR') {
  return { success: false, error: { code, message, messageEn } };
}

export function isDigital(paymentMethod: PaymentMethod): boolean {
  return paymentMethod === PaymentMethod.VODAFONE_CASH || paymentMethod === PaymentMethod.INSTAPAY;
}

/** Pure check-in input validation: digital payments require a reference; money must be 2dp. */
export function validateCheckinInput(input: { paymentMethod: PaymentMethod; paymentReference?: string | null; amountPaid?: number }) {
  if (input.amountPaid !== undefined && !isValidMoneyAmount(input.amountPaid)) {
    return validation('المبلغ المدفوع غير صالح، يجب أن يكون رقماً بدقتين عشريتين على الأكثر.', 'The amount paid is invalid.');
  }
  if (isDigital(input.paymentMethod) && !input.paymentReference?.trim()) {
    return validation(`الرجاء إدخال مرجع المعاملة الرقمية (رقم المحول أو رقم التحويل) لطريقة الدفع ${input.paymentMethod}.`, `A payment reference is required for ${input.paymentMethod} payments.`, 'PAYMENT_REFERENCE_REQUIRED');
  }
  return null;
}

async function getActiveShift(receptionistId: string) {
  return prisma.shiftRegister.findFirst({
    where: { receptionistId, status: ShiftStatus.OPEN },
    orderBy: { openedAt: 'desc' },
  });
}

/**
 * Refuses a check-in only when the center has no verified subscription and has
 * burned its unpaid visit allowance.
 *
 * Runs two extra queries, but only for centers that are actually unpaid: a
 * verified subscription short-circuits on the first query, so paying centers
 * pay no cost on the hot check-in path.
 *
 * Fails open when the tenant row is unreadable — a broken cap must never lock a
 * center out of recording its students.
 */
async function findUnpaidVisitGateError(
  tenantId: string | null | undefined,
  client: PrismaClient | Prisma.TransactionClient = prisma,
) {
  if (!tenantId) return null;

  const [tenant, activeSubscription] = await Promise.all([
    client.tenant.findUnique({ where: { id: tenantId }, select: { visitLimit: true, createdAt: true } }),
    client.subscription.findFirst({
      where: { tenantId, status: SubscriptionStatus.ACTIVE, periodEnd: { gt: new Date() } },
      orderBy: { periodEnd: 'desc' },
    }),
  ]);

  if (!tenant || activeSubscription) return null;

  const usedVisits = await client.attendance.count({ where: buildVisitCountWhere(tenant.createdAt, tenantId) });
  const gate = resolveUnpaidVisitGate({ hasVerifiedSubscription: false, usedVisits, visitLimit: tenant.visitLimit });
  if (gate.allowed) return null;

  return {
    code: gate.code,
    message: gate.message,
    messageEn: gate.messageEn,
    details: { limit: gate.limit, used: gate.used, remaining: gate.remaining },
  };
}

const attendanceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/sessions/active', { preHandler: authenticate }, async (request, reply) => {
    const deskFilter = (request.query as { deskFilter?: string; roomId?: string; teacherId?: string }).deskFilter;
    const sessionWhere: Record<string, unknown> = {
      OR: [{ status: SessionStatus.ACTIVE }, { status: SessionStatus.SCHEDULED }],
    };

    const now = new Date();
    if (deskFilter) {
      const ids = deskFilter.split(',').map((item) => item.trim()).filter(Boolean);
      if (ids.length > 0) {
        sessionWhere.id = { in: ids };
      }
    }

    const sessions = await prisma.session.findMany({
      where: { ...sessionWhere, startTime: { lte: new Date(now.getTime() + 30 * 60 * 1000) } },
      include: {
        teacher: { select: { id: true, fullName: true, subject: true } },
        room: { select: { id: true, name: true, capacity: true } },
        _count: { select: { attendances: { where: { status: { not: AttendanceStatus.VOID } } } } },
      },
      orderBy: [{ status: 'desc' }, { startTime: 'asc' }],
    });

    const filtered = sessions.filter((session) => isSessionEligibleForLobbyDashboard({
      status: session.status,
      startTime: session.startTime,
      endTime: session.endTime,
    }));

    return reply.send({
      success: true,
      data: {
        sessions: filtered.map((session) => ({
          id: session.id,
          title: session.title,
          academicStage: session.academicStage,
          teacher: {
            id: session.teacher.id,
            fullName: session.teacher.fullName,
            subject: session.teacher.subject,
          },
          room: {
            id: session.room.id,
            name: session.room.name,
            capacity: session.room.capacity,
          },
          startTime: session.startTime.toISOString(),
          endTime: session.endTime.toISOString(),
          sessionPrice: Number(session.sessionPrice),
          centerFeePerStudent: Number(session.centerFeePerStudent),
          currentLobbyCount: session._count.attendances,
          status: session.status,
        })),
      },
    });
  });

  app.post<{ Body: AttendanceBody }>('/checkin', {
    preHandler: [authenticate, requireRoles(Role.ADMIN, Role.RECEPTIONIST), app.rateLimit.checkIn],
    schema: { body: attendanceSchema },
  }, async (request, reply) => {
    const { sessionId, studentId, paymentMethod, paymentReference, amountPaid } = request.body;

    if (!isValidUUID(sessionId) || !isValidUUID(studentId)) {
      return reply.code(400).send(validation('معرّفات الحصة أو الطالب غير صالحة.', 'Session or student id is invalid.'));
    }
    const inputError = validateCheckinInput({ paymentMethod, paymentReference, amountPaid });
    if (inputError) return reply.code(400).send(inputError);

    const activeShift = await getActiveShift(request.user.sub);
    if (!activeShift) {
      return reply.code(400).send(validation('يجب فتح وردية نشطة قبل تسجيل حضور الطلاب.', 'An active shift must be open before check-in.', 'SHIFT_NOT_OPEN'));
    }

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { room: true },
    });

    if (!session) {
      return reply.code(404).send(validation('الحصة غير موجودة.', 'Session not found.', 'SESSION_NOT_FOUND'));
    }

    if (session.status !== SessionStatus.ACTIVE && session.status !== SessionStatus.SCHEDULED) {
      return reply.code(400).send(validation('الحصة غير متاحة للجلسات الحالية.', 'The session is not available for check-in.', 'SESSION_NOT_ACTIVE'));
    }

    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) {
      return reply.code(404).send(validation('الطالب غير موجود.', 'Student not found.', 'STUDENT_NOT_FOUND'));
    }

    const currentAttendanceCount = await prisma.attendance.count({ where: { sessionId, status: { not: AttendanceStatus.VOID } } });
    if (currentAttendanceCount >= session.room.capacity) {
      return reply.code(400).send(validation('وصلت الحصة إلى الحد الأقصى للسعة.', 'Session capacity has been reached.', 'SESSION_CAPACITY_REACHED'));
    }

    const fee = Number(session.sessionPrice);
    const cashAmount = amountPaid ?? fee;
    const duplicate = await prisma.attendance.findFirst({ where: { sessionId, studentId, status: { not: AttendanceStatus.VOID } } });

    const unpaidGateError = await findUnpaidVisitGateError(request.user.tenantId);
    if (unpaidGateError) {
      return reply.code(403).send({ success: false, error: unpaidGateError });
    }

    if (duplicate) {
      return reply.code(409).send({
        success: false,
        error: {
          code: 'DUPLICATE_CHECK_IN',
          message: 'تم تسجيل الطالب في هذه الحصة مسبقاً.',
          messageEn: 'This student has already checked in to this session.',
          details: { checkedInAt: duplicate.checkInTime.toISOString(), deskIdentifier: activeShift.deskIdentifier },
        },
      });
    }

    try {
      const { attendance, newLobbyCount } = await prisma.$transaction(async (transaction) => {
        const currentShift = await transaction.shiftRegister.findUnique({ where: { id: activeShift.id }, select: { status: true } });
        if (!currentShift || currentShift.status !== ShiftStatus.OPEN) throw new Error('SHIFT_CLOSED_DURING_CHECKIN');
        const currentAttendanceCount = await transaction.attendance.count({ where: { sessionId, status: { not: AttendanceStatus.VOID } } });
        if (currentAttendanceCount >= session.room.capacity) throw new Error('SESSION_CAPACITY_REACHED');
        // Re-checked inside the transaction so concurrent check-ins cannot race
        // past the unpaid cap (the Serializable isolation would abort, not
        // oversell, if two doors commit together).
        const gateError = await findUnpaidVisitGateError(request.user.tenantId, transaction);
        if (gateError) throw new Error('UNPAID_VISIT_LIMIT');
        const attendance = await transaction.attendance.create({
          data: {
            sessionId,
            studentId,
            receptionistId: request.user.sub,
            shiftRegisterId: activeShift.id,
            amountPaid: new Prisma.Decimal(cashAmount),
            changeOwed: new Prisma.Decimal(calculateChangeOwed(cashAmount, fee)),
            paymentMethod,
            paymentReference: paymentReference?.trim() || null,
            status: isPartialPayment(cashAmount, fee) ? AttendanceStatus.PARTIAL : AttendanceStatus.PAID,
          },
        });
        const newLobbyCount = await transaction.attendance.count({ where: { sessionId, status: { not: AttendanceStatus.VOID } } });
        await recordAuditEntry({ actorId: request.user.sub, shiftRegisterId: activeShift.id, action: 'ATTENDANCE_CHECKED_IN', entityType: 'ATTENDANCE', entityId: attendance.id, amount: cashAmount, metadata: { sessionId, studentId, paymentMethod, status: attendance.status } }, transaction);
        return { attendance, newLobbyCount };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      const payload = buildLobbyAttendancePayload({
        sessionId,
        studentId,
        studentName: student.fullName,
        deskIdentifier: activeShift.deskIdentifier,
        paymentMethod: attendance.paymentMethod,
        newLobbyCount,
        timestamp: attendance.checkInTime,
      });

      if (request.user.tenantId) {
        app.io?.to(`tenant:${request.user.tenantId}:lobby`).emit('attendance:checked_in', payload);
      }
      app.io?.to('center:lobby').emit('attendance:checked_in', payload);

      return reply.code(201).send({
        success: true,
        data: {
          attendance: {
            id: attendance.id,
            sessionId: attendance.sessionId,
            studentId: attendance.studentId,
            studentName: student.fullName,
            amountPaid: Number(attendance.amountPaid),
            sessionPrice: fee,
            remainingDue: calculateRemainingDue(Number(attendance.amountPaid), fee),
            changeOwed: Number(attendance.changeOwed),
            paymentMethod: attendance.paymentMethod,
            status: attendance.status,
            checkInTime: attendance.checkInTime.toISOString(),
            deskIdentifier: activeShift.deskIdentifier,
          },
          newSessionLobbyCount: newLobbyCount,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'SHIFT_CLOSED_DURING_CHECKIN') {
        return reply.code(409).send(validation('تم إغلاق الوردية أثناء تسجيل الحضور.', 'The shift was closed while checking in.', 'SHIFT_CLOSED'));
      }
      if (error instanceof Error && error.message === 'SESSION_CAPACITY_REACHED') {
        return reply.code(400).send(validation('وصلت الحصة إلى الحد الأقصى للسعة.', 'Session capacity has been reached.', 'SESSION_CAPACITY_REACHED'));
      }
      if (error instanceof Error && error.message === 'UNPAID_VISIT_LIMIT') {
        // Recompute outside the rolled-back transaction for a precise message.
        const gateError = await findUnpaidVisitGateError(request.user.tenantId);
        return reply.code(403).send({
          success: false,
          error: gateError ?? {
            code: 'UNPAID_VISIT_LIMIT',
            message: 'تم استنفاد حد المتابعات المسموح به للمركز غير المدفوع. أكّد الاشتراك لمتابعة تسجيل حضور الطلاب.',
            messageEn: 'This center used all of its unpaid visit allowance. Verify the subscription to keep checking students in.',
            details: { limit: null, used: null, remaining: 0 },
          },
        });
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return reply.code(409).send({
          success: false,
          error: {
            code: 'DUPLICATE_CHECK_IN',
            message: 'تم تسجيل الطالب في هذه الحصة مسبقاً.',
            messageEn: 'This student has already checked in to this session.',
          },
        });
      }
      throw error;
    }
  });

  app.get<{ Params: { sessionId: string }; Querystring: { page?: string; limit?: string } }>('/sessions/:sessionId/attendances', { preHandler: authenticate }, async (request, reply) => {
    if (!isValidUUID(request.params.sessionId)) {
      return reply.code(400).send(validation('معرّف الحصة غير صالح.', 'The session id is invalid.'));
    }
    const pagination = parsePagination(request.query);
    if (!pagination.ok) return reply.code(400).send(pagination.error);

    const [attendances, total] = await Promise.all([
      prisma.attendance.findMany({
        where: { sessionId: request.params.sessionId },
        include: {
          student: { select: { id: true, fullName: true, guardianPhone: true, studentPhone: true } },
          shiftRegister: { select: { deskIdentifier: true } },
          session: { select: { sessionPrice: true, title: true } },
        },
        orderBy: { checkInTime: 'asc' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      prisma.attendance.count({ where: { sessionId: request.params.sessionId } }),
    ]);

    return reply.send({
      success: true,
      data: {
        attendances: attendances.map((attendance) => {
          const fee = Number(attendance.session.sessionPrice);
          const amountPaid = Number(attendance.amountPaid);
          return {
            id: attendance.id,
            studentId: attendance.studentId,
            studentName: attendance.student.fullName,
            guardianPhone: attendance.student.guardianPhone,
            studentPhone: attendance.student.studentPhone,
            amountPaid,
            sessionPrice: fee,
            remainingDue: calculateRemainingDue(amountPaid, fee),
            changeOwed: Number(attendance.changeOwed),
            paymentMethod: attendance.paymentMethod,
            status: attendance.status,
            checkInTime: attendance.checkInTime.toISOString(),
            deskIdentifier: attendance.shiftRegister.deskIdentifier,
          };
        }),
        pagination: { page: pagination.page, limit: pagination.limit, total, pages: Math.ceil(total / pagination.limit) },
      },
    });
  });

  app.post<{ Params: { id: string } }>('/attendances/:id/void', {
    preHandler: [authenticate, requireRoles(Role.ADMIN, Role.RECEPTIONIST), app.rateLimit.financial],
    schema: {
      params: {
        type: 'object',
        required: ['id'],
        additionalProperties: false,
        properties: { id: { type: 'string', pattern: UUID_FORMAT } },
      },
    },
  }, async (request, reply) => {
    if (!isValidUUID(request.params.id)) {
      return reply.code(400).send(validation('معرّف الحضور غير صالح.', 'The attendance id is invalid.'));
    }

    const attendance = await prisma.attendance.findUnique({
      where: { id: request.params.id },
      include: {
        session: { select: { id: true, status: true, roomId: true } },
        shiftRegister: { select: { id: true, status: true, deskIdentifier: true } },
        student: { select: { fullName: true } },
      },
    });
    if (!attendance) {
      return reply.code(404).send(validation('سجل الحضور غير موجود.', 'Attendance record not found.', 'ATTENDANCE_NOT_FOUND'));
    }
    if (attendance.status === AttendanceStatus.VOID) {
      return reply.code(409).send(validation('سجل الحضور ملغي بالفعل.', 'This check-in has already been voided.', 'ATTENDANCE_ALREADY_VOID'));
    }
    if (attendance.session.status === SessionStatus.COMPLETED) {
      return reply.code(409).send(validation('لا يمكن إلغاء حضور في حصة منتهية ومقفلة.', 'Check-ins on a locked completed session cannot be voided.', 'SESSION_LOCKED'));
    }
    const canVoid =
      request.user.role === Role.ADMIN ||
      (attendance.shiftRegister.status === ShiftStatus.OPEN &&
        (await prisma.shiftRegister.findFirst({
          where: { id: attendance.shiftRegister.id, receptionistId: request.user.sub, status: ShiftStatus.OPEN },
          select: { id: true },
        })) !== null);

    if (!canVoid) {
      return reply.code(403).send(validation('لا يمكنك إلغاء حضور مسجّل ضمن وردية مقفلة أو لا تملكها.', 'You can only void check-ins from an open shift you own.', 'VOID_FORBIDDEN'));
    }

    const voided = await prisma.$transaction(async (transaction) => {
      const current = await transaction.attendance.findUnique({ where: { id: request.params.id }, include: { session: { select: { status: true } } } });
      if (!current || current.status === AttendanceStatus.VOID) throw new Error('ATTENDANCE_ALREADY_VOID');
      if (current.session.status === SessionStatus.COMPLETED) throw new Error('SESSION_LOCKED');
      const updated = await transaction.attendance.update({ where: { id: request.params.id }, data: { status: AttendanceStatus.VOID } });
      await recordAuditEntry({
        actorId: request.user.sub,
        shiftRegisterId: attendance.shiftRegister.id,
        action: 'ATTENDANCE_VOIDED',
        entityType: 'ATTENDANCE',
        entityId: updated.id,
        amount: Number(updated.amountPaid),
        metadata: { sessionId: attendance.session.id, studentId: updated.studentId, method: updated.paymentMethod, voidedAmount: Number(updated.amountPaid) },
      }, transaction);
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const newLobbyCount = await prisma.attendance.count({ where: { sessionId: attendance.session.id, status: { not: AttendanceStatus.VOID } } });
    app.io?.to('center:lobby').emit('attendance:voided', { sessionId: attendance.session.id, attendanceId: voided.id, newLobbyCount });

    return reply.send({
      success: true,
      data: {
        attendance: {
          id: voided.id,
          status: voided.status,
          sessionId: attendance.session.id,
          newSessionLobbyCount: newLobbyCount,
        },
      },
    });
  });
};

export default attendanceRoutes;
