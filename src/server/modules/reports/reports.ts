import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { AttendanceStatus, PaymentMethod, Role, SettlementStatus } from '../../../shared/constants/index.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requireRoles } from '../auth/auth.js';
import { isValidUUID, parseAuditPagination, validationError } from '../../lib/http.js';

export function dateBounds(date: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return Number.isNaN(start.getTime()) ? null : { start, end };
}

function number(value: Prisma.Decimal | number | null | undefined): number {
  return value === null || value === undefined ? 0 : Number(value);
}

export function calculateDailyReportTotals(input: {
  attendees: number;
  centerRevenue: number;
  teacherPayouts: number;
  vodafoneCash: number;
  instapay: number;
}) {
  return {
    totalAttendees: input.attendees,
    centerNetRevenue: number(input.centerRevenue),
    teacherPayouts: number(input.teacherPayouts),
    digitalCollections: number(input.vodafoneCash + input.instapay),
    digitalCollectionsByMethod: {
      vodafoneCash: number(input.vodafoneCash),
      instapay: number(input.instapay),
    },
  };
}

const reportRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Querystring: { date?: string } }>('/daily', { preHandler: [authenticate, requireRoles(Role.ADMIN, Role.RECEPTIONIST)] }, async (request, reply) => {
    const tenantId = request.user.tenantId;
    if (!tenantId) {
      return reply.status(403).send(validationError('لا يوجد مركز مرتبط بحسابك.', 'Your account is not attached to a center.', 'TENANT_CONTEXT_MISSING'));
    }
    const date = request.query.date ?? new Date().toISOString().slice(0, 10);
    const bounds = dateBounds(date);
    if (!bounds) {
      return reply.status(400).send(validationError('صيغة التاريخ غير صالحة.', 'Date must use YYYY-MM-DD format.', 'INVALID_REPORT_DATE'));
    }

    const attendanceWhere = { tenantId, checkInTime: { gte: bounds.start, lt: bounds.end }, status: { not: AttendanceStatus.VOID } };
    const settlementWhere = { tenantId, settledAt: { gte: bounds.start, lt: bounds.end }, status: SettlementStatus.DISBURSED };
    const [attendanceTotals, settlementTotals] = await Promise.all([
      prisma.attendance.groupBy({ by: ['paymentMethod'], where: attendanceWhere, _sum: { amountPaid: true }, _count: { _all: true } }),
      prisma.sessionSettlement.aggregate({ where: settlementWhere, _sum: { centerRevenue: true, teacherPayout: true } }),
    ]);
    const attendanceCount = attendanceTotals.reduce((sum, row) => sum + row._count._all, 0);

    const digital = (method: PaymentMethod) => number(attendanceTotals.find((row) => row.paymentMethod === method)?._sum.amountPaid);
    const isAdmin = request.user.role === Role.ADMIN;
    const centerRevenue = isAdmin ? number(settlementTotals._sum.centerRevenue) : 0;
    const teacherPayouts = isAdmin ? number(settlementTotals._sum.teacherPayout) : 0;
    return reply.send({
      success: true,
      data: {
        date,
        ...calculateDailyReportTotals({
          attendees: attendanceCount,
          centerRevenue,
          teacherPayouts,
          vodafoneCash: digital(PaymentMethod.VODAFONE_CASH),
          instapay: digital(PaymentMethod.INSTAPAY),
        }),
      },
    });
  });

  app.get<{ Params: { shiftId: string }; Querystring: { page?: string; limit?: string; from?: string; to?: string } }>('/shifts/:shiftId/audit', { preHandler: [authenticate, requireRoles(Role.ADMIN, Role.RECEPTIONIST)] }, async (request, reply) => {
    if (!isValidUUID(request.params.shiftId)) {
      return reply.status(400).send(validationError('معرّف الوردية غير صالح.', 'The shift id is invalid.'));
    }
    const pagination = parseAuditPagination(request.query);
    if (!pagination.ok) return reply.status(400).send(pagination.error);
    const tenantId = request.user.tenantId;
    if (!tenantId) {
      return reply.status(403).send(validationError('لا يوجد مركز مرتبط بحسابك.', 'Your account is not attached to a center.', 'TENANT_CONTEXT_MISSING'));
    }

    // Scoped by center: the audit log carries every amount that moved through the
    // drawer, so an ADMIN of one center could otherwise read another center's
    // whole shift simply by supplying its id. Resolving the shift by tenant makes
    // a foreign shift indistinguishable from a missing one.
    const shift = await prisma.shiftRegister.findFirst({ where: { id: request.params.shiftId, tenantId }, select: { id: true, receptionistId: true } });
    if (!shift) return reply.status(404).send(validationError('الوردية غير موجودة.', 'Shift not found.', 'SHIFT_NOT_FOUND'));
    if (request.user.role !== Role.ADMIN && shift.receptionistId !== request.user.sub) return reply.status(403).send(validationError('لا يسمح لك بعرض سجل هذه الوردية.', 'You cannot view this shift audit log.', 'AUDIT_ACCESS_DENIED'));

    // Deliberately keyed on shiftRegisterId alone: the shift above is already
    // proven to belong to the caller, and audit rows written before AuditLog
    // carried a tenantId would otherwise disappear from the log.
    const where: NonNullable<Parameters<typeof prisma.auditLog.findMany>[0]>['where'] = { shiftRegisterId: shift.id };
    if (pagination.from || pagination.to) {
      where.createdAt = { ...(pagination.from ? { gte: pagination.from } : {}), ...(pagination.to ? { lt: pagination.to } : {}) };
    }

    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({ where, include: { actor: { select: { id: true, fullName: true, role: true } } }, orderBy: { createdAt: 'asc' }, skip: pagination.skip, take: pagination.limit }),
      prisma.auditLog.count({ where }),
    ]);
    return reply.send({
      success: true,
      data: {
        shiftId: shift.id,
        entries: entries.map((entry) => ({ ...entry, amount: entry.amount === null ? null : Number(entry.amount), createdAt: entry.createdAt.toISOString() })),
        pagination: { page: pagination.page, limit: pagination.limit, total, pages: Math.ceil(total / pagination.limit) },
      },
    });
  });
};

export default reportRoutes;