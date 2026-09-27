import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { Role } from '../../../shared/constants/index.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requireRoles } from '../auth/auth.js';
import { requireTenantWritable } from '../../lib/tenantLifecycle.js';
import { normalizeArabicText } from '../../../shared/utils/arabicNormalization.js';
import { isValidUUID, uuidParamsSchema } from '../../lib/http.js';

const egyptianPhone = /^(010|011|012|015)[0-9]{8}$/;
type RoomBody = { name: string; capacity: number; floor?: string | null; isActive?: boolean };
type TeacherBody = { fullName: string; phoneNumber: string; subject: string; defaultCenterFee: number; assistantName?: string | null; assistantPhone?: string | null; isActive?: boolean };

const roomSchema = { type: 'object', required: ['name', 'capacity'], additionalProperties: false, properties: { name: { type: 'string', minLength: 1, maxLength: 50 }, capacity: { type: 'integer', minimum: 1, maximum: 10000 }, floor: { type: ['string', 'null'], maxLength: 20 }, isActive: { type: 'boolean' } } } as const;
const teacherSchema = { type: 'object', required: ['fullName', 'phoneNumber', 'subject', 'defaultCenterFee'], additionalProperties: false, properties: { fullName: { type: 'string', minLength: 2, maxLength: 100 }, phoneNumber: { type: 'string', pattern: '^(010|011|012|015)[0-9]{8}$' }, subject: { type: 'string', minLength: 1, maxLength: 50 }, defaultCenterFee: { type: 'number', minimum: 0, maximum: 100000 }, assistantName: { type: ['string', 'null'], maxLength: 100 }, assistantPhone: { type: ['string', 'null'], pattern: '^(010|011|012|015)[0-9]{8}$' }, isActive: { type: 'boolean' } } } as const;

function invalid(message: string, messageEn: string) { return { success: false, error: { code: 'VALIDATION_ERROR', message, messageEn } }; }
function serializeTeacher(teacher: Prisma.TeacherGetPayload<{}>) { return { ...teacher, defaultCenterFee: teacher.defaultCenterFee.toString() }; }
function conflict(reply: { code: (status: number) => { send: (body: unknown) => unknown } }, message: string, messageEn: string) { return reply.code(409).send({ success: false, error: { code: 'RESOURCE_IN_USE', message, messageEn } }); }

/** Pure Egyptian-mobile validation for teacher and assistant phones. */
export function validateTeacherPhones(phoneNumber: string, assistantPhone?: string | null) {
  if (!egyptianPhone.test(phoneNumber) || (assistantPhone && !egyptianPhone.test(assistantPhone))) {
    return invalid('رقم الهاتف يجب أن يكون رقم محمول مصري صحيح.', 'Use a valid Egyptian mobile number.');
  }
  return null;
}

/** Pure room-name validation: trimmed non-empty name required. */
export function cleanRoomName(name: string): string {
  return name.trim();
}

const managementRoutes: FastifyPluginAsync = async (app) => {
  app.get('/rooms', { preHandler: authenticate }, async (request, reply) => {
    const where = request.user?.tenantId ? { tenantId: request.user.tenantId } : {};
    return reply.send({ success: true, data: { rooms: await prisma.room.findMany({ where, orderBy: { name: 'asc' } }) } });
  });

  app.post<{ Body: RoomBody }>('/rooms', { preHandler: [authenticate, requireRoles(Role.ADMIN), requireTenantWritable], schema: { body: roomSchema } }, async (request, reply) => {
    try {
      const room = await prisma.room.create({
        data: {
          tenantId: request.user.tenantId || null,
          name: request.body.name.trim(),
          capacity: request.body.capacity,
          floor: request.body.floor?.trim() || null,
          isActive: request.body.isActive ?? true,
        },
      });
      return reply.code(201).send({ success: true, data: { room } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return reply.code(409).send(invalid('اسم القاعة مستخدم بالفعل.', 'A room with this name already exists.'));
      throw error;
    }
  });

  app.patch<{ Params: { id: string }; Body: Partial<RoomBody> }>('/rooms/:id', { preHandler: [authenticate, requireRoles(Role.ADMIN), requireTenantWritable], schema: { params: uuidParamsSchema, body: { ...roomSchema, required: [] } } }, async (request, reply) => {
    if (!isValidUUID(request.params.id)) return reply.code(400).send(invalid('معرّف القاعة غير صالح.', 'The room id is invalid.'));
    try { const room = await prisma.room.update({ where: { id: request.params.id }, data: { ...(request.body.name === undefined ? {} : { name: request.body.name.trim() }), ...(request.body.capacity === undefined ? {} : { capacity: request.body.capacity }), ...(request.body.floor === undefined ? {} : { floor: request.body.floor?.trim() || null }), ...(request.body.isActive === undefined ? {} : { isActive: request.body.isActive }) } }); return reply.send({ success: true, data: { room } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return reply.code(404).send(invalid('القاعة غير موجودة.', 'Room not found.')); if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return reply.code(409).send(invalid('اسم القاعة مستخدم بالفعل.', 'A room with this name already exists.')); throw error; }
  });

  app.delete<{ Params: { id: string } }>('/rooms/:id', { preHandler: [authenticate, requireRoles(Role.ADMIN), requireTenantWritable], schema: { params: uuidParamsSchema } }, async (request, reply) => { if (!isValidUUID(request.params.id)) return reply.code(400).send(invalid('معرّف القاعة غير صالح.', 'The room id is invalid.')); try { await prisma.room.delete({ where: { id: request.params.id } }); return reply.send({ success: true, data: null }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return reply.code(404).send(invalid('القاعة غير موجودة.', 'Room not found.')); if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') return conflict(reply, 'لا يمكن حذف قاعة مرتبطة بحصص.', 'A room used by sessions cannot be deleted.'); throw error; } });

  app.get('/teachers', { preHandler: authenticate }, async (request, reply) => {
    const where = request.user?.tenantId ? { tenantId: request.user.tenantId } : {};
    const teachers = await prisma.teacher.findMany({ where, orderBy: { fullName: 'asc' } });
    return reply.send({ success: true, data: { teachers: teachers.map(serializeTeacher) } });
  });

  app.post<{ Body: TeacherBody }>('/teachers', { preHandler: [authenticate, requireRoles(Role.ADMIN), requireTenantWritable], schema: { body: teacherSchema } }, async (request, reply) => {
    const body = request.body;
    const phoneError = validateTeacherPhones(body.phoneNumber, body.assistantPhone);
    if (phoneError) return reply.code(400).send(phoneError);
    const teacher = await prisma.teacher.create({
      data: {
        tenantId: request.user.tenantId || null,
        fullName: body.fullName.trim(),
        searchName: normalizeArabicText(body.fullName),
        phoneNumber: body.phoneNumber,
        subject: body.subject.trim(),
        defaultCenterFee: new Prisma.Decimal(body.defaultCenterFee),
        assistantName: body.assistantName?.trim() || null,
        assistantPhone: body.assistantPhone || null,
        isActive: body.isActive ?? true,
      },
    });
    return reply.code(201).send({ success: true, data: { teacher: serializeTeacher(teacher) } });
  });

  app.patch<{ Params: { id: string }; Body: Partial<TeacherBody> }>('/teachers/:id', { preHandler: [authenticate, requireRoles(Role.ADMIN), requireTenantWritable], schema: { params: uuidParamsSchema, body: { ...teacherSchema, required: [] } } }, async (request, reply) => { if (!isValidUUID(request.params.id)) return reply.code(400).send(invalid('معرّف المدرس غير صالح.', 'The teacher id is invalid.')); const body = request.body; if (body.phoneNumber && !egyptianPhone.test(body.phoneNumber)) return reply.code(400).send(invalid('رقم الهاتف يجب أن يكون رقم محمول مصري صحيح.', 'Use a valid Egyptian mobile number.')); if (body.assistantPhone && !egyptianPhone.test(body.assistantPhone)) return reply.code(400).send(invalid('رقم هاتف المساعد غير صحيح.', 'Use a valid assistant Egyptian mobile number.')); try { const teacher = await prisma.teacher.update({ where: { id: request.params.id }, data: { ...(body.fullName === undefined ? {} : { fullName: body.fullName.trim(), searchName: normalizeArabicText(body.fullName) }), ...(body.phoneNumber === undefined ? {} : { phoneNumber: body.phoneNumber }), ...(body.subject === undefined ? {} : { subject: body.subject.trim() }), ...(body.defaultCenterFee === undefined ? {} : { defaultCenterFee: new Prisma.Decimal(body.defaultCenterFee) }), ...(body.assistantName === undefined ? {} : { assistantName: body.assistantName?.trim() || null }), ...(body.assistantPhone === undefined ? {} : { assistantPhone: body.assistantPhone || null }), ...(body.isActive === undefined ? {} : { isActive: body.isActive }) } }); return reply.send({ success: true, data: { teacher: serializeTeacher(teacher) } }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return reply.code(404).send(invalid('المدرس غير موجود.', 'Teacher not found.')); throw error; } });
  app.delete<{ Params: { id: string } }>('/teachers/:id', { preHandler: [authenticate, requireRoles(Role.ADMIN), requireTenantWritable], schema: { params: uuidParamsSchema } }, async (request, reply) => { if (!isValidUUID(request.params.id)) return reply.code(400).send(invalid('معرّف المدرس غير صالح.', 'The teacher id is invalid.')); try { await prisma.teacher.delete({ where: { id: request.params.id } }); return reply.send({ success: true, data: null }); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return reply.code(404).send(invalid('المدرس غير موجود.', 'Teacher not found.')); if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') return conflict(reply, 'لا يمكن حذف مدرس مرتبط بحصص.', 'A teacher used by sessions cannot be deleted.'); throw error; } });
};

export default managementRoutes;
