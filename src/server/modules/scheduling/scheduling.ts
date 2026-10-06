import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { Role, SessionStatus } from '../../../shared/constants/index.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requireRoles } from '../auth/auth.js';
import { requireTenantWritable } from '../../lib/tenantLifecycle.js';
import { isValidMoneyAmount, isValidUUID, uuidParamsSchema } from '../../lib/http.js';

export type SessionBody = {
  teacherId: string;
  roomId: string;
  title: string;
  academicStage: string;
  startTime: string;
  endTime: string;
  sessionPrice: number;
  centerFeePerStudent: number;
  status?: SessionStatus;
};

type SessionParams = { id: string };
const UUID_FORMAT = '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
const sessionSchema = {
  type: 'object', required: ['teacherId', 'roomId', 'title', 'academicStage', 'startTime', 'endTime', 'sessionPrice', 'centerFeePerStudent'], additionalProperties: false,
  properties: {
    teacherId: { type: 'string', pattern: UUID_FORMAT }, roomId: { type: 'string', pattern: UUID_FORMAT }, title: { type: 'string', minLength: 1, maxLength: 150 }, academicStage: { type: 'string', minLength: 1, maxLength: 50 },
    startTime: { type: 'string', format: 'date-time' }, endTime: { type: 'string', format: 'date-time' }, sessionPrice: { type: 'number', minimum: 0, maximum: 100000 }, centerFeePerStudent: { type: 'number', minimum: 0, maximum: 100000 }, status: { type: 'string', enum: Object.values(SessionStatus) },
  },
} as const;

function validation(message: string, messageEn: string, code = 'VALIDATION_ERROR') { return { success: false, error: { code, message, messageEn } }; }

export function validateSessionStatusChange(
  currentStatus: string,
  nextStatus?: string,
):
  | { ok: true }
  | { ok: false; httpStatus: 400 | 409; code: 'SESSION_LOCKED' | 'INVALID_STATUS'; message: string; messageEn: string } {
  if (currentStatus === SessionStatus.COMPLETED) {
    return {
      ok: false,
      httpStatus: 409,
      code: 'SESSION_LOCKED',
      message: 'لا يمكن تعديل حصة منتهية.',
      messageEn: 'Completed sessions cannot be modified.',
    };
  }
  if (nextStatus === SessionStatus.COMPLETED) {
    return {
      ok: false,
      httpStatus: 400,
      code: 'INVALID_STATUS',
      message: 'لا يمكن تحويل الحصة إلى حالة منتهية مباشرة.',
      messageEn: 'A session cannot be set to completed directly.',
    };
  }
  return { ok: true };
}
export function parseTimes(body: SessionBody) { const start = new Date(body.startTime); const end = new Date(body.endTime); return Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start ? null : { start, end }; }
export function validateSessionInput(body: SessionBody, times: { start: Date; end: Date } | null) {
  if (!times) return validation('وقت النهاية يجب أن يكون بعد وقت البداية.', 'End time must be after start time.');
  if (body.sessionPrice < body.centerFeePerStudent) return validation('سعر الحصة يجب ألا يقل عن رسوم السنتر.', 'Session price cannot be less than the center fee.');
  if (!isValidMoneyAmount(body.sessionPrice) || !isValidMoneyAmount(body.centerFeePerStudent)) return validation('المبالغ المالية يجب أن تكون رقماً بدقتين عشريتين على الأكثر.', 'Monetary values must be numbers with at most two decimal places.');
  return null;
}
export function buildOverlapWhere(body: SessionBody, id?: string, tenantId?: string) {
  const times = parseTimes(body);
  if (!times) throw new Error('INVALID_TIMES');
  return {
    startTime: { lt: times.end },
    endTime: { gt: times.start },
    status: { not: SessionStatus.CANCELLED },
    // Conflict detection must stay inside one center: otherwise booking tenant
    // A's room at a time tenant B already booked it returns a 409 that leaks
    // tenant B's schedule, and vice versa.
    ...(tenantId ? { tenantId } : {}),
    ...(id ? { id: { not: id } } : {}),
  };
}
function scheduleConflict(reply: { code: (status: number) => { send: (body: unknown) => unknown } }, resource: string) { return reply.code(409).send(validation(`يوجد تعارض في موعد ${resource} خلال هذه الفترة.`, `${resource} is already booked during this time.`, 'SCHEDULE_CONFLICT')); }

export async function ensureAvailable(body: SessionBody, id: string | undefined, db: Prisma.TransactionClient | typeof prisma, tenantId: string) {
  const times = parseTimes(body);
  const inputError = validateSessionInput(body, times);
  if (inputError) return { error: inputError };
  // A teacher or room belonging to another center must be reported as missing,
  // never borrowed: linking tenant A's session to tenant B's teacher would leak
  // B's name, subject and payout into A's settlement.
  const [teacher, room] = await Promise.all([db.teacher.findFirst({ where: { id: body.teacherId, tenantId } }), db.room.findFirst({ where: { id: body.roomId, tenantId } })]);
  if (!teacher || !teacher.isActive) return { error: validation('المدرس غير موجود أو غير نشط.', 'Teacher not found or inactive.') };
  if (!room || !room.isActive) return { error: validation('القاعة غير موجودة أو غير نشطة.', 'Room not found or inactive.') };
  const overlap = buildOverlapWhere(body, id, tenantId);
  const [roomConflict, teacherConflict] = await Promise.all([db.session.findFirst({ where: { roomId: body.roomId, ...overlap }, select: { id: true } }), db.session.findFirst({ where: { teacherId: body.teacherId, ...overlap }, select: { id: true } })]);
  if (roomConflict) return { conflict: 'القاعة' };
  if (teacherConflict) return { conflict: 'المدرس' };
  return { times };
}

const schedulingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/sessions', { preHandler: authenticate }, async (request, reply) => {
    const query = request.query as { from?: string; to?: string };
    if (query.from !== undefined && Number.isNaN(new Date(query.from).getTime())) return reply.code(400).send(validation('تاريخ البداية (from) غير صحيح.', 'The start date (from) is invalid.'));
    if (query.to !== undefined && Number.isNaN(new Date(query.to).getTime())) return reply.code(400).send(validation('تاريخ النهاية (to) غير صحيح.', 'The end date (to) is invalid.'));
    const timeWhere = query.from || query.to ? { startTime: { ...(query.to ? { lt: new Date(query.to) } : {}), ...(query.from ? { gte: new Date(query.from) } : {}) } } : {};
    const tenantId = request.user?.tenantId;
    // No tenant, no schedule. Without this a token minted for no center (or any
    // missing claim) would read every center's timetable.
    if (!tenantId) return reply.send({ success: true, data: { sessions: [] } });
    const where: Prisma.SessionWhereInput = { ...timeWhere, tenantId };
    const sessions = await prisma.session.findMany({ where, include: { teacher: { select: { id: true, fullName: true, subject: true } }, room: { select: { id: true, name: true, capacity: true } } }, orderBy: { startTime: 'asc' } });
    return reply.send({ success: true, data: { sessions: sessions.map((session) => ({ ...session, sessionPrice: session.sessionPrice.toString(), centerFeePerStudent: session.centerFeePerStudent.toString() })) } });
  });
  app.post<{ Body: SessionBody }>('/sessions', { preHandler: [authenticate, requireRoles(Role.ADMIN), requireTenantWritable], schema: { body: sessionSchema } }, async (request, reply) => {
    const tenantId = request.user.tenantId;
    if (!tenantId) return reply.code(400).send(validation('الحساب غير مرتبط بمركز تعليمي.', 'Account has no tenant assigned.', 'TENANT_REQUIRED'));
    const statusCheck = validateSessionStatusChange(SessionStatus.SCHEDULED, request.body.status);
    if (!statusCheck.ok) return reply.code(statusCheck.httpStatus).send(validation(statusCheck.message, statusCheck.messageEn, statusCheck.code));
    const result = await prisma.$transaction(async (tx) => {
      const checked = await ensureAvailable(request.body, undefined, tx, tenantId);
      if (checked.error) return { kind: 'error' as const, error: checked.error };
      if (checked.conflict) return { kind: 'conflict' as const, conflict: checked.conflict };
      const session = await tx.session.create({
        data: {
          tenantId,
          teacherId: request.body.teacherId,
          roomId: request.body.roomId,
          title: request.body.title.trim(),
          academicStage: request.body.academicStage.trim(),
          startTime: checked.times!.start,
          endTime: checked.times!.end,
          sessionPrice: new Prisma.Decimal(request.body.sessionPrice),
          centerFeePerStudent: new Prisma.Decimal(request.body.centerFeePerStudent),
          status: request.body.status ?? SessionStatus.SCHEDULED,
          createdById: request.user.sub,
        },
      });
      return { kind: 'ok' as const, session };
    });
    if (result.kind === 'error') return reply.code(400).send(result.error);
    if (result.kind === 'conflict') return scheduleConflict(reply, result.conflict);
    return reply.code(201).send({ success: true, data: { session: result.session } });
  });
  app.patch<{ Params: SessionParams; Body: Partial<SessionBody> }>('/sessions/:id', { preHandler: [authenticate, requireRoles(Role.ADMIN), requireTenantWritable], schema: { params: uuidParamsSchema, body: { ...sessionSchema, required: [] } } }, async (request, reply) => {
    if (!isValidUUID(request.params.id)) return reply.code(400).send(validation('معرّف الحصة غير صالح.', 'The session id is invalid.'));
    const tenantId = request.user.tenantId;
    if (!tenantId) return reply.code(400).send(validation('الحساب غير مرتبط بمركز تعليمي.', 'Account has no tenant assigned.', 'TENANT_REQUIRED'));
    const preStatusCheck = validateSessionStatusChange(SessionStatus.SCHEDULED, request.body.status);
    if (!preStatusCheck.ok) return reply.code(preStatusCheck.httpStatus).send(validation(preStatusCheck.message, preStatusCheck.messageEn, preStatusCheck.code));
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.session.findFirst({ where: { id: request.params.id, tenantId } });
      if (!current) return { kind: 'notFound' as const };
      const statusCheck = validateSessionStatusChange(current.status, request.body.status);
      if (!statusCheck.ok) return { kind: 'statusError' as const, check: statusCheck };
      const body: SessionBody = { teacherId: request.body.teacherId ?? current.teacherId, roomId: request.body.roomId ?? current.roomId, title: request.body.title ?? current.title, academicStage: request.body.academicStage ?? current.academicStage, startTime: request.body.startTime ?? current.startTime.toISOString(), endTime: request.body.endTime ?? current.endTime.toISOString(), sessionPrice: request.body.sessionPrice ?? Number(current.sessionPrice), centerFeePerStudent: request.body.centerFeePerStudent ?? Number(current.centerFeePerStudent), status: request.body.status ?? current.status };
      const checked = await ensureAvailable(body, request.params.id, tx, tenantId);
      if (checked.error) return { kind: 'error' as const, error: checked.error };
      if (checked.conflict) return { kind: 'conflict' as const, conflict: checked.conflict };
      const session = await tx.session.update({ where: { id: request.params.id, tenantId }, data: { teacherId: body.teacherId, roomId: body.roomId, title: body.title.trim(), academicStage: body.academicStage.trim(), startTime: checked.times!.start, endTime: checked.times!.end, sessionPrice: new Prisma.Decimal(body.sessionPrice), centerFeePerStudent: new Prisma.Decimal(body.centerFeePerStudent), status: body.status } });
      return { kind: 'ok' as const, session };
    });
    if (result.kind === 'notFound') return reply.code(404).send(validation('الحصة غير موجودة.', 'Session not found.', 'SESSION_NOT_FOUND'));
    if (result.kind === 'statusError') return reply.code(result.check.httpStatus).send(validation(result.check.message, result.check.messageEn, result.check.code));
    if (result.kind === 'error') return reply.code(400).send(result.error);
    if (result.kind === 'conflict') return scheduleConflict(reply, result.conflict);
    return reply.send({ success: true, data: { session: result.session } });
  });
  app.delete<{ Params: SessionParams }>('/sessions/:id', {
    preHandler: [authenticate, requireRoles(Role.ADMIN), requireTenantWritable],
    schema: { params: uuidParamsSchema },
  }, async (request, reply) => {
    if (!isValidUUID(request.params.id)) return reply.code(400).send(validation('معرّف الحصة غير صالح.', 'The session id is invalid.'));
    const tenantId = request.user.tenantId;
    if (!tenantId) return reply.code(400).send(validation('الحساب غير مرتبط بمركز تعليمي.', 'Account has no tenant assigned.', 'TENANT_REQUIRED'));
    const session = await prisma.session.findFirst({ where: { id: request.params.id, tenantId }, select: { status: true } });
    if (!session) return reply.code(404).send(validation('الحصة غير موجودة.', 'Session not found.', 'SESSION_NOT_FOUND'));
    if (session.status === SessionStatus.COMPLETED) return reply.code(409).send(validation('لا يمكن حذف حصة منتهية.', 'Completed sessions cannot be deleted.', 'SESSION_LOCKED'));
    await prisma.session.update({ where: { id: request.params.id, tenantId }, data: { status: SessionStatus.CANCELLED } });
    return reply.send({ success: true, data: null });
  });
};

export default schedulingRoutes;
