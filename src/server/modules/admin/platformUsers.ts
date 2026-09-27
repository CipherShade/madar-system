/**
 * Platform-wide user directory (super-admin console).
 *
 * Lists every account across all centers with Arabic-insensitive search and
 * filtering, and exposes the owner actions the console needs: view a user,
 * create one inside a center, edit, disable/enable, reset access and revoke
 * sessions.
 *
 * Session note: access tokens are stateless JWTs, so "revoke sessions" sets
 * the account inactive (which blocks every new login immediately) and is
 * audited as such. Tokens already issued stay valid until their own expiry —
 * the response says so explicitly instead of over-promising.
 */

import argon2 from 'argon2';
import { Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { Role } from '../../../shared/constants/index.js';
import { normalizeArabicText } from '../../../shared/utils/arabicNormalization.js';
import { prisma } from '../../lib/prisma.js';
import { isValidUUID } from '../../lib/http.js';
import { authenticate, requireRoles } from '../auth/auth.js';
import { recordSuperAdminAudit } from './audit.js';
import { buildUserSearchWhere, fail, paginationFromQuery, paginationPayload } from './platformHelpers.js';

const SUPER_ADMIN_GATE = [authenticate, requireRoles(Role.SUPER_ADMIN)];

const ASSIGNABLE_ROLES = [Role.ADMIN, Role.RECEPTIONIST] as const;
const TEMP_PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Temporary password for a reset: readable, random, and returned only once. */
function generateTemporaryPassword(): string {
  let password = '';
  for (let index = 0; index < 14; index += 1) {
    password += TEMP_PASSWORD_ALPHABET[Math.floor(Math.random() * TEMP_PASSWORD_ALPHABET.length)];
  }
  return `Mdr!${password}`;
}

const directoryUserSelect = {
  id: true,
  tenantId: true,
  username: true,
  email: true,
  fullName: true,
  role: true,
  phoneNumber: true,
  preferredLanguage: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

const platformUsersRoutes: FastifyPluginAsync = async (app) => {
  // ── GET /users — platform-wide directory ────────────────────────────────
  app.get<{
    Querystring: {
      search?: string;
      role?: string;
      status?: string;
      centerId?: string;
      page?: string;
      limit?: string;
    };
  }>('/users', { preHandler: SUPER_ADMIN_GATE }, async (request, reply) => {
    const { page, limit, skip } = paginationFromQuery(request.query);
    const searchWhere = buildUserSearchWhere(request.query.search ?? '');
    const status = request.query.status ?? 'all';

    const where: Prisma.UserWhereInput = {
      ...(searchWhere ? { AND: [searchWhere] } : {}),
      ...(request.query.centerId ? { tenantId: request.query.centerId } : {}),
      ...(request.query.role && request.query.role !== 'all' ? { role: request.query.role as Role } : {}),
      ...(status === 'active' ? { isActive: true } : {}),
      ...(status === 'inactive' ? { isActive: false } : {}),
    };

    const [users, total, centers] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
        select: {
          ...directoryUserSelect,
          tenant: { select: { id: true, name: true, slug: true, plan: true, isActive: true } },
        },
      }),
      prisma.user.count({ where }),
      prisma.tenant.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, slug: true, plan: true },
        take: 500,
      }),
    ]);

    return reply.send({
      success: true,
      data: {
        users: users.map((user) => ({
          ...user,
          centerName: user.tenant?.name ?? null,
          centerPlan: user.tenant?.plan ?? null,
          tenant: undefined,
        })),
        centers,
        roles: ASSIGNABLE_ROLES,
        pagination: paginationPayload(page, limit, total),
      },
    });
  });

  // ── GET /users/:id — full user view with activity ───────────────────────
  app.get<{ Params: { id: string } }>('/users/:id', { preHandler: SUPER_ADMIN_GATE }, async (request, reply) => {
    if (!isValidUUID(request.params.id)) {
      return fail(reply, 400, 'INVALID_ID', 'معرّف المستخدم غير صالح.', 'The user id is invalid.');
    }

    const user = await prisma.user.findUnique({
      where: { id: request.params.id },
      select: {
        ...directoryUserSelect,
        updatedAt: true,
        tenant: {
          select: {
            id: true, name: true, slug: true, plan: true, isActive: true,
            maxUsers: true, visitLimit: true, maxDesks: true, maxBranches: true,
          },
        },
        _count: { select: { auditLogs: true, shiftRegisters: true, attendances: true } },
      },
    });
    if (!user) return fail(reply, 404, 'USER_NOT_FOUND', 'المستخدم غير موجود.', 'User not found.');

    const [recentActivity, centerUsers] = await Promise.all([
      prisma.auditLog.findMany({
        where: { actorId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, action: true, entityType: true, entityId: true, createdAt: true, amount: true },
      }),
      user.tenantId
        ? prisma.user.count({ where: { tenantId: user.tenantId, isActive: true } })
        : Promise.resolve(0),
    ]);

    return reply.send({
      success: true,
      data: {
        user: {
          ...user,
          centerUsersActive: centerUsers,
          recentActivity: recentActivity.map((entry) => ({
            ...entry,
            amount: entry.amount?.toString() ?? null,
          })),
        },
      },
    });
  });

  // ── POST /users — create a user inside a center ─────────────────────────
  app.post<{
    Body: {
      centerId: string;
      username: string;
      fullName: string;
      password?: string;
      role?: string;
      phoneNumber?: string;
      email?: string;
      reason?: string;
    };
  }>(
    '/users',
    {
      preHandler: SUPER_ADMIN_GATE,
      schema: {
        body: {
          type: 'object',
          required: ['centerId', 'username', 'fullName'],
          additionalProperties: false,
          properties: {
            centerId: { type: 'string', format: 'uuid' },
            username: { type: 'string', minLength: 3, maxLength: 50, pattern: '^[a-zA-Z0-9_-]+$' },
            fullName: { type: 'string', minLength: 2, maxLength: 100 },
            password: { type: 'string', minLength: 8, maxLength: 200 },
            role: { type: 'string', enum: [...ASSIGNABLE_ROLES] },
            phoneNumber: { type: 'string', pattern: '^(010|011|012|015)[0-9]{8}$' },
            email: { type: 'string', minLength: 3, maxLength: 200 },
            reason: { type: 'string', minLength: 2, maxLength: 500 },
          },
        },
      },
    },
    async (request, reply) => {
      const { centerId, username, fullName, role, phoneNumber, email } = request.body;

      const center = await prisma.tenant.findUnique({
        where: { id: centerId },
        select: { id: true, name: true, isActive: true, maxUsers: true, _count: { select: { users: true } } },
      });
      if (!center) return fail(reply, 404, 'CENTER_NOT_FOUND', 'المركز غير موجود.', 'Center not found.');
      if (!center.isActive) {
        return fail(reply, 409, 'CENTER_SUSPENDED', 'لا يمكن إضافة مستخدم لمركز موقوف.', 'Cannot add a user to a suspended center.');
      }
      if (center._count.users >= center.maxUsers) {
        return fail(
          reply,
          409,
          'CENTER_USER_LIMIT_REACHED',
          `بلغ المركز حد المستخدمين المسموح به (${center.maxUsers}). زد الحد أو امنح استثناء استخدام أولًا.`,
          `The center reached its user limit (${center.maxUsers}). Raise the limit or grant a usage override first.`,
        );
      }

      const existing = await prisma.user.findFirst({
        where: { OR: [{ username }, ...(email ? [{ email }] : [])] },
        select: { id: true, username: true },
      });
      if (existing) {
        return fail(reply, 409, 'USER_EXISTS', 'اسم الدخول أو البريد الإلكتروني مستخدم بالفعل.', 'That username or email is already in use.');
      }

      const temporaryPassword = request.body.password ?? generateTemporaryPassword();
      const passwordHash = await argon2.hash(temporaryPassword, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      const created = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            tenantId: centerId,
            username,
            fullName: fullName.trim(),
            searchName: normalizeArabicText(fullName),
            email: email ?? null,
            phoneNumber: phoneNumber ?? null,
            role: (role ?? Role.RECEPTIONIST) as Role,
            passwordHash,
          },
          select: { ...directoryUserSelect, tenant: { select: { id: true, name: true, plan: true } } },
        });

        await recordSuperAdminAudit(
          {
            actorId: request.user.sub,
            tenantId: centerId,
            action: 'PLATFORM_USER_CREATED',
            entityType: 'User',
            entityId: user.id,
            afterJson: { username: user.username, role: user.role, center: center.name, temporaryPasswordIssued: true },
            reason: request.body.reason ?? null,
            ip: request.ip ?? null,
          },
          tx,
        );

        return user;
      });

      return reply.code(201).send({
        success: true,
        data: {
          user: created,
          // Shown once, never stored in plaintext and never written to the audit log.
          temporaryPassword: request.body.password ? null : temporaryPassword,
        },
      });
    },
  );

  // ── PATCH /users/:id — edit role / contact / active state ───────────────
  app.patch<{
    Params: { id: string };
    Body: { fullName?: string; email?: string; phoneNumber?: string; role?: string; isActive?: boolean; reason?: string };
  }>(
    '/users/:id',
    {
      preHandler: SUPER_ADMIN_GATE,
      schema: {
        body: {
          type: 'object',
          minProperties: 1,
          additionalProperties: false,
          properties: {
            fullName: { type: 'string', minLength: 2, maxLength: 100 },
            email: { type: 'string', minLength: 3, maxLength: 200 },
            phoneNumber: { type: 'string', pattern: '^(010|011|012|015)[0-9]{8}$' },
            role: { type: 'string', enum: [...ASSIGNABLE_ROLES] },
            isActive: { type: 'boolean' },
            reason: { type: 'string', minLength: 2, maxLength: 500 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!isValidUUID(request.params.id)) {
        return fail(reply, 400, 'INVALID_ID', 'معرّف المستخدم غير صالح.', 'The user id is invalid.');
      }

      const before = await prisma.user.findUnique({
        where: { id: request.params.id },
        select: { id: true, tenantId: true, username: true, fullName: true, email: true, phoneNumber: true, role: true, isActive: true },
      });
      if (!before) return fail(reply, 404, 'USER_NOT_FOUND', 'المستخدم غير موجود.', 'User not found.');

      if (request.body.role && before.role === Role.SUPER_ADMIN) {
        return fail(reply, 409, 'CANNOT_EDIT_SUPER_ADMIN_ROLE', 'لا يمكن تغيير صلاحية حساب المالك.', 'The owner account role cannot be changed.');
      }
      if (request.body.isActive === false && before.id === request.user.sub) {
        return fail(reply, 409, 'CANNOT_DISABLE_SELF', 'لا يمكنك إيقاف حسابك الحالي.', 'You cannot disable your own account.');
      }
      if (request.body.isActive === false && before.role === Role.SUPER_ADMIN) {
        return fail(reply, 409, 'CANNOT_DISABLE_SUPER_ADMIN', 'لا يمكن إيقاف حساب المالك من هنا.', 'The owner account cannot be disabled from here.');
      }
      if (request.body.email) {
        const taken = await prisma.user.findFirst({ where: { email: request.body.email, id: { not: before.id } }, select: { id: true } });
        if (taken) return fail(reply, 409, 'EMAIL_TAKEN', 'هذا البريد الإلكتروني مستخدم بالفعل.', 'This email is already in use.');
      }

      const { fullName, email, phoneNumber, role, isActive, reason } = request.body;

      const user = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: before.id },
          data: {
            ...(fullName === undefined ? {} : { fullName: fullName.trim(), searchName: normalizeArabicText(fullName) }),
            ...(email === undefined ? {} : { email: email.trim() }),
            ...(phoneNumber === undefined ? {} : { phoneNumber }),
            ...(role === undefined ? {} : { role: role as Role }),
            ...(isActive === undefined ? {} : { isActive }),
          },
          select: { ...directoryUserSelect, tenant: { select: { id: true, name: true, plan: true } } },
        });

        const action = isActive === false
          ? 'PLATFORM_USER_DISABLED'
          : isActive === true
            ? 'PLATFORM_USER_ENABLED'
            : role !== undefined
              ? 'PLATFORM_USER_ROLE_CHANGED'
              : 'PLATFORM_USER_UPDATED';

        await recordSuperAdminAudit(
          {
            actorId: request.user.sub,
            tenantId: before.tenantId,
            action,
            entityType: 'User',
            entityId: before.id,
            beforeJson: before as unknown as Prisma.InputJsonValue,
            afterJson: {
              fullName: updated.fullName,
              email: updated.email,
              phoneNumber: updated.phoneNumber,
              role: updated.role,
              isActive: updated.isActive,
            },
            reason: reason ?? null,
            ip: request.ip ?? null,
          },
          tx,
        );

        return updated;
      });

      return reply.send({ success: true, data: { user } });
    },
  );

  // ── POST /users/:id/reset-password — issue a new temporary password ─────
  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/users/:id/reset-password',
    {
      preHandler: SUPER_ADMIN_GATE,
      schema: {
        body: {
          type: 'object',
          required: ['reason'],
          additionalProperties: false,
          properties: { reason: { type: 'string', minLength: 2, maxLength: 500 } },
        },
      },
    },
    async (request, reply) => {
      if (!isValidUUID(request.params.id)) {
        return fail(reply, 400, 'INVALID_ID', 'معرّف المستخدم غير صالح.', 'The user id is invalid.');
      }

      const before = await prisma.user.findUnique({
        where: { id: request.params.id },
        select: { id: true, tenantId: true, username: true, isActive: true },
      });
      if (!before) return fail(reply, 404, 'USER_NOT_FOUND', 'المستخدم غير موجود.', 'User not found.');

      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await argon2.hash(temporaryPassword, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: before.id }, data: { passwordHash } });
        await recordSuperAdminAudit(
          {
            actorId: request.user.sub,
            tenantId: before.tenantId,
            action: 'PLATFORM_USER_PASSWORD_RESET',
            entityType: 'User',
            entityId: before.id,
            // The password itself is never recorded.
            afterJson: { username: before.username, temporaryPasswordIssued: true },
            reason: request.body.reason,
            ip: request.ip ?? null,
          },
          tx,
        );
      });

      return reply.send({
        success: true,
        data: {
          userId: before.id,
          username: before.username,
          temporaryPassword,
          noticeAr: 'كلمة المرور المؤقتة تُعرض مرة واحدة فقط — سلّمها للمستخدم ثم اطلب منه تغييرها.',
          noticeEn: 'The temporary password is shown once — hand it to the user and ask them to change it.',
        },
      });
    },
  );

  // ── POST /users/:id/revoke-sessions — block future logins ──────────────
  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/users/:id/revoke-sessions',
    {
      preHandler: SUPER_ADMIN_GATE,
      schema: {
        body: {
          type: 'object',
          required: ['reason'],
          additionalProperties: false,
          properties: { reason: { type: 'string', minLength: 2, maxLength: 500 } },
        },
      },
    },
    async (request, reply) => {
      if (!isValidUUID(request.params.id)) {
        return fail(reply, 400, 'INVALID_ID', 'معرّف المستخدم غير صالح.', 'The user id is invalid.');
      }

      const before = await prisma.user.findUnique({
        where: { id: request.params.id },
        select: { id: true, tenantId: true, username: true, isActive: true, role: true },
      });
      if (!before) return fail(reply, 404, 'USER_NOT_FOUND', 'المستخدم غير موجود.', 'User not found.');
      if (before.id === request.user.sub) {
        return fail(reply, 409, 'CANNOT_REVOKE_SELF', 'لا يمكنك إبطال جلسات حسابك الحالي.', 'You cannot revoke your own sessions.');
      }
      if (before.role === Role.SUPER_ADMIN) {
        return fail(reply, 409, 'CANNOT_REVOKE_SUPER_ADMIN', 'لا يمكن إبطال جلسات حساب المالك.', 'The owner account sessions cannot be revoked.');
      }

      const user = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: before.id },
          data: { isActive: false },
          select: { ...directoryUserSelect, tenant: { select: { id: true, name: true, plan: true } } },
        });

        await recordSuperAdminAudit(
          {
            actorId: request.user.sub,
            tenantId: before.tenantId,
            action: 'PLATFORM_USER_SESSIONS_REVOKED',
            entityType: 'User',
            entityId: before.id,
            beforeJson: { username: before.username, isActive: before.isActive },
            // Honest scope: no session store exists, so already-issued tokens
            // keep working until they expire on their own.
            afterJson: { username: before.username, isActive: false, issuedTokensRevoked: false },
            reason: request.body.reason,
            ip: request.ip ?? null,
          },
          tx,
        );

        return updated;
      });

      return reply.send({
        success: true,
        data: {
          user,
          noticeAr: 'تم إيقاف الحساب فورًا. الرموز التي صُدرت قبل الإيقاف تظل صالحة حتى انتهاء صلاحيتها.',
          noticeEn: 'The account is blocked immediately. Tokens issued before this stay valid until they expire.',
        },
      });
    },
  );
};

export default platformUsersRoutes;
