import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import argon2 from 'argon2';
import { Role, ASSIGNABLE_ROLES, isAssignableRole } from '../../../shared/constants/index.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requireRoles } from '../auth/auth.js';
import { requireTenantWritable } from '../../lib/tenantLifecycle.js';
import { recordAuditEntry } from '../reports/audit.js';
import { isValidUUID } from '../../lib/http.js';

const egyptianPhone = /^(010|011|012|015)[0-9]{8}$/;
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,50}$/;

type CreateUserBody = {
  username: string;
  password: string;
  fullName: string;
  role: Role;
  phoneNumber?: string | null;
  preferredLanguage?: 'ar' | 'en';
  isActive?: boolean;
};

type UpdateUserBody = {
  fullName?: string;
  role?: Role;
  phoneNumber?: string | null;
  preferredLanguage?: 'ar' | 'en';
  isActive?: boolean;
  password?: string;
};

const createSchema = {
  type: 'object',
  required: ['username', 'password', 'fullName', 'role'],
  additionalProperties: false,
  properties: {
    username: { type: 'string', pattern: '^[a-zA-Z0-9_.-]{3,50}$' },
    password: { type: 'string', minLength: 8, maxLength: 200 },
    fullName: { type: 'string', minLength: 2, maxLength: 100 },
    role: { type: 'string', enum: ASSIGNABLE_ROLES },
    phoneNumber: { type: ['string', 'null'], pattern: '^(010|011|012|015)[0-9]{8}$' },
    preferredLanguage: { type: 'string', enum: ['ar', 'en'] },
    isActive: { type: 'boolean' },
  },
} as const;

const updateSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fullName: { type: 'string', minLength: 2, maxLength: 100 },
    role: { type: 'string', enum: ASSIGNABLE_ROLES },
    phoneNumber: { type: ['string', 'null'], pattern: '^(010|011|012|015)[0-9]{8}$' },
    preferredLanguage: { type: 'string', enum: ['ar', 'en'] },
    isActive: { type: 'boolean' },
    password: { type: 'string', minLength: 8, maxLength: 200 },
  },
} as const;

function invalid(message: string, messageEn: string, code = 'VALIDATION_ERROR') {
  return { success: false, error: { code, message, messageEn } };
}

function serializeUser(user: { id: string; username: string; fullName: string; role: string; phoneNumber: string | null; preferredLanguage: string; isActive: boolean; createdAt: Date }) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    phoneNumber: user.phoneNumber,
    preferredLanguage: user.preferredLanguage,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
  };
}

const publicUserSelect = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  phoneNumber: true,
  preferredLanguage: true,
  isActive: true,
  createdAt: true,
} as const;

const userRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [authenticate, requireRoles(Role.ADMIN)] }, async (request, reply) => {
    // Scoped to the caller's center. Without this, every admin on the platform
    // could list every username, full name, role and phone number in one call.
    const tenantId = request.user.tenantId;
    if (!tenantId) return reply.code(403).send(invalid('لا يوجد مركز مرتبط بحسابك.', 'Your account is not attached to a center.', 'TENANT_CONTEXT_MISSING'));
    const users = await prisma.user.findMany({
      where: { tenantId },
      select: publicUserSelect,
      orderBy: { createdAt: 'asc' },
    });
    return reply.send({ success: true, data: { users: users.map(serializeUser) } });
  });

  app.post<{ Body: CreateUserBody }>('/', { preHandler: [authenticate, requireRoles(Role.ADMIN), requireTenantWritable], schema: { body: createSchema } }, async (request, reply) => {
    const username = request.body.username.trim();
    if (!USERNAME_RE.test(username)) {
      return reply.code(400).send(invalid('اسم المستخدم يجب أن يكون من 3 إلى 50 حرفاً (أحرف/أرقام/_.-).', 'Username must be 3-50 characters (letters, digits, _ . -).'));
    }
    // Defence in depth: the schema already rejects SUPER_ADMIN, but if that enum
    // is ever widened this guard is what stops a center admin minting one.
    if (!isAssignableRole(request.body.role)) {
      return reply.code(403).send(invalid('لا يمكنك منح هذا الدور.', 'You cannot assign that role.', 'ROLE_NOT_ASSIGNABLE'));
    }
    // A center-scoped user list must not silently create a platform-level account.
    const tenantId = request.user.tenantId;
    if (!tenantId) return reply.code(403).send(invalid('لا يوجد مركز مرتبط بحسابك.', 'Your account is not attached to a center.', 'TENANT_CONTEXT_MISSING'));
    const exists = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (exists) {
      return reply.code(409).send(invalid('اسم المستخدم مستخدم بالفعل.', 'This username is already taken.', 'USERNAME_TAKEN'));
    }
    if (request.body.phoneNumber && !egyptianPhone.test(request.body.phoneNumber)) {
      return reply.code(400).send(invalid('رقم الهاتف يجب أن يكون رقم محمول مصري صحيح.', 'Use a valid Egyptian mobile number.'));
    }
    const passwordHash = await argon2.hash(request.body.password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 });
    const user = await prisma.$transaction(async (transaction) => {
      const created = await transaction.user.create({
        data: {
          tenantId,
          username,
          passwordHash,
          fullName: request.body.fullName.trim(),
          role: request.body.role,
          phoneNumber: request.body.phoneNumber || null,
          preferredLanguage: request.body.preferredLanguage ?? 'ar',
          isActive: request.body.isActive ?? true,
        },
        select: publicUserSelect,
      });
      await recordAuditEntry({ actorId: request.user.sub, tenantId, shiftRegisterId: null, action: 'USER_CREATED', entityType: 'USER', entityId: created.id, metadata: { username: created.username, role: created.role } }, transaction);
      return created;
    });
    return reply.code(201).send({ success: true, data: { user: serializeUser(user) } });
  });

  app.patch<{ Params: { id: string }; Body: UpdateUserBody }>('/:id', { preHandler: [authenticate, requireRoles(Role.ADMIN), requireTenantWritable], schema: { body: updateSchema } }, async (request, reply) => {
    if (!isValidUUID(request.params.id)) return reply.code(400).send(invalid('معرّف المستخدم غير صالح.', 'The user id is invalid.'));
    // A center admin manages their own staff, full stop. Undefined tenantId
    // would drop the scope from the filter entirely, so it must fail closed
    // rather than fall back to "any tenant".
    const tenantId = request.user.tenantId;
    if (!tenantId) return reply.code(403).send(invalid('لا يوجد مركز مرتبط بحسابك.', 'Your account is not attached to a center.', 'TENANT_CONTEXT_MISSING'));
    if (request.params.id === request.user.sub && request.body.isActive === false) {
      return reply.code(400).send(invalid('لا يمكنك تعطيل حسابك الخاص.', 'You cannot deactivate your own account.', 'SELF_DEACTIVATE'));
    }
    if (request.params.id === request.user.sub && request.body.role && request.body.role !== request.user.role) {
      return reply.code(400).send(invalid('لا يمكنك تعديل دور حسابك الخاص.', 'You cannot change your own role.', 'SELF_ROLE_CHANGE'));
    }
    if (request.body.role !== undefined && !isAssignableRole(request.body.role)) {
      return reply.code(403).send(invalid('لا يمكنك منح هذا الدور.', 'You cannot assign that role.', 'ROLE_NOT_ASSIGNABLE'));
    }
    if (request.body.phoneNumber && !egyptianPhone.test(request.body.phoneNumber)) {
      return reply.code(400).send(invalid('رقم الهاتف يجب أن يكون رقم محمول مصري صحيح.', 'Use a valid Egyptian mobile number.'));
    }

    try {
      const user = await prisma.$transaction(async (transaction) => {
        const passwordHash = request.body.password ? await argon2.hash(request.body.password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 }) : undefined;
        const updated = await transaction.user.update({
          // Compound where: a row belonging to another center simply does not
          // match, so it falls into the P2025 → 404 below instead of being
          // renamed, re-roled, or having its password reset. Scoping the id
          // alone is what let an admin take over any login on the platform.
          where: { id: request.params.id, tenantId },
          data: {
            ...(request.body.fullName === undefined ? {} : { fullName: request.body.fullName.trim() }),
            ...(request.body.role === undefined ? {} : { role: request.body.role }),
            ...(request.body.phoneNumber === undefined ? {} : { phoneNumber: request.body.phoneNumber || null }),
            ...(request.body.preferredLanguage === undefined ? {} : { preferredLanguage: request.body.preferredLanguage }),
            ...(request.body.isActive === undefined ? {} : { isActive: request.body.isActive }),
            ...(passwordHash ? { passwordHash } : {}),
          },
          select: publicUserSelect,
        });
        await recordAuditEntry({ actorId: request.user.sub, tenantId, shiftRegisterId: null, action: 'USER_UPDATED'.concat(request.body.password ? '_PASSWORD_RESET' : ''), entityType: 'USER', entityId: updated.id, metadata: { username: updated.username } }, transaction);
        return updated;
      });
      return reply.send({ success: true, data: { user: serializeUser(user) } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return reply.code(404).send(invalid('المستخدم غير موجود.', 'User not found.', 'USER_NOT_FOUND'));
      }
      throw error;
    }
  });

  app.delete<{ Params: { id: string } }>('/:id', { preHandler: [authenticate, requireRoles(Role.ADMIN), requireTenantWritable] }, async (request, reply) => {
    if (!isValidUUID(request.params.id)) return reply.code(400).send(invalid('معرّف المستخدم غير صالح.', 'The user id is invalid.'));
    const tenantId = request.user.tenantId;
    if (!tenantId) return reply.code(403).send(invalid('لا يوجد مركز مرتبط بحسابك.', 'Your account is not attached to a center.', 'TENANT_CONTEXT_MISSING'));
    if (request.params.id === request.user.sub) {
      return reply.code(400).send(invalid('لا يمكنك حذف حسابك الخاص.', 'You cannot delete your own account.', 'SELF_DELETE'));
    }
    try {
      const user = await prisma.$transaction(async (transaction) => {
        const current = await transaction.user.findFirst({ where: { id: request.params.id, tenantId }, select: { username: true } });
        const updated = await transaction.user.update({
          where: { id: request.params.id, tenantId },
          data: { isActive: false, username: `${current?.username ?? 'user'}-disabled-${Date.now()}` },
          select: publicUserSelect,
        });
        await recordAuditEntry({ actorId: request.user.sub, tenantId, shiftRegisterId: null, action: 'USER_DEACTIVATED', entityType: 'USER', entityId: updated.id, metadata: { username: updated.username } }, transaction);
        return updated;
      });
      return reply.send({ success: true, data: { user: serializeUser(user) } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return reply.code(404).send(invalid('المستخدم غير موجود.', 'User not found.', 'USER_NOT_FOUND'));
      }
      throw error;
    }
  });
};

export default userRoutes;
