import argon2 from 'argon2';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsync } from 'fastify';
import { Role } from '../../../shared/constants/index.js';
import { prisma } from '../../lib/prisma.js';
import { config } from '../../config/index.js';
import { recordAuditEntry } from '../reports/audit.js';

import { getPlanConfig } from '../../../shared/constants/plans.js';

export type AuthTokenPayload = {
  sub: string;
  username: string;
  role: Role;
  tenantId?: string | null;
};

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: AuthTokenPayload;
    user: AuthTokenPayload;
  }
}

type LoginBody = { username: string; password: string };

type RegisterCenterBody = {
  centerName: string;
  ownerName: string;
  ownerPhone: string;
  username: string;
  password: string;
  plan?: 'BASIC' | 'GROWTH' | 'PRO' | 'MULTI_BRANCH' | 'BUSINESS';
};

const publicUserSelect = {
  id: true,
  tenantId: true,
  username: true,
  fullName: true,
  role: true,
  preferredLanguage: true,
  phoneNumber: true,
} as const;

function setAuthCookie(reply: FastifyReply, token: string): void {
  reply.setCookie('access_token', token, {
    httpOnly: true,
    signed: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    path: '/',
    maxAge: config.sessionCookieMaxAgeSeconds,
  });
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    await reply.code(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'يجب تسجيل الدخول أولاً.', messageEn: 'Authentication is required.' },
    });
  }
}

export function requireRoles(...roles: Role[]) {
  return async function roleGuard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    if (!request.user || !roles.includes(request.user.role)) {
      await reply.code(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'ليس لديك صلاحية لتنفيذ هذا الإجراء.', messageEn: 'You do not have permission to perform this action.' },
      });
    }
  };
}

const authRoutes: FastifyPluginAsync = async (app) => {
  app.post<{ Body: LoginBody }>('/login', {
    preHandler: [app.rateLimit.login],
    schema: {
      body: {
        type: 'object',
        required: ['username', 'password'],
        properties: { username: { type: 'string', minLength: 1, maxLength: 50 }, password: { type: 'string', minLength: 1, maxLength: 200 } },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { username: request.body.username }, select: { ...publicUserSelect, passwordHash: true, isActive: true } });
    if (!user || !user.isActive || !(await argon2.verify(user.passwordHash, request.body.password))) {
      return reply.code(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'اسم المستخدم أو كلمة المرور غير صحيحة.', messageEn: 'Invalid username or password.' },
      });
    }

    const token = await app.jwt.sign({ sub: user.id, username: user.username, role: user.role as Role, tenantId: user.tenantId }, { expiresIn: config.jwtExpiresIn });
    setAuthCookie(reply, token);
    const { passwordHash: _passwordHash, isActive: _isActive, ...safeUser } = user;
    return reply.send({ success: true, data: { user: safeUser } });
  });

  app.post<{ Body: RegisterCenterBody }>('/register-center', {
    preHandler: [app.rateLimit.login],
    schema: {
      body: {
        type: 'object',
        required: ['centerName', 'ownerName', 'ownerPhone', 'username', 'password'],
        properties: {
          centerName: { type: 'string', minLength: 2, maxLength: 100 },
          ownerName: { type: 'string', minLength: 2, maxLength: 100 },
          ownerPhone: { type: 'string', pattern: '^(010|011|012|015)[0-9]{8}$' },
          username: { type: 'string', minLength: 3, maxLength: 50, pattern: '^[a-zA-Z0-9_-]+$' },
          password: { type: 'string', minLength: 8, maxLength: 200 },
          plan: { type: 'string', enum: ['BASIC', 'GROWTH', 'PRO', 'MULTI_BRANCH', 'BUSINESS'] },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const existingUser = await prisma.user.findUnique({ where: { username: request.body.username } });
    if (existingUser) {
      return reply.code(409).send({
        success: false,
        error: { code: 'USERNAME_TAKEN', message: 'اسم المستخدم مسجل مسبقاً، يرجى اختيار اسم مستخدم آخر.', messageEn: 'Username is already taken.' },
      });
    }

    const requestedPlan = request.body.plan || 'BASIC';
    const planConfig = getPlanConfig(requestedPlan);
    const trialDays = 14;
    const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);
    const slugSuffix = Math.random().toString(36).substring(2, 7);
    const slug = `center-${slugSuffix}`;

    const passwordHash = await argon2.hash(request.body.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: request.body.centerName,
          slug,
          ownerName: request.body.ownerName,
          ownerPhone: request.body.ownerPhone,
          plan: planConfig.id as any,
          trialEndsAt,
          isActive: true,
          maxDesks: planConfig.maxReceptionists ?? 999,
          maxBranches: planConfig.maxBranches ?? 99,
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          username: request.body.username,
          fullName: request.body.ownerName,
          phoneNumber: request.body.ownerPhone,
          email: `${request.body.username}@${slug}.local`,
          passwordHash,
          role: Role.ADMIN,
          preferredLanguage: 'ar',
          isActive: true,
        },
        select: publicUserSelect,
      });

      // Initialize default branch
      const branch = await tx.branch.create({
        data: {
          tenantId: tenant.id,
          name: 'الفرع الرئيسي',
          address: 'المقر الرئيسي',
          phoneNumber: request.body.ownerPhone,
          isActive: true,
        },
      });

      // Initialize default room for quick start linked to the branch
      await tx.room.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          name: 'قاعة ١ (الرئيسية)',
          capacity: 60,
          floor: 'الطابق الأول',
          isActive: true,
        },
      });

      await recordAuditEntry({
        actorId: user.id,
        shiftRegisterId: null,
        action: 'TENANT_REGISTERED',
        entityType: 'TENANT',
        entityId: tenant.id,
        metadata: { centerName: tenant.name, plan: tenant.plan },
      }, tx);

      return { user, tenant };
    });

    const token = await app.jwt.sign(
      { sub: result.user.id, username: result.user.username, role: result.user.role as Role, tenantId: result.tenant.id },
      { expiresIn: config.jwtExpiresIn }
    );
    setAuthCookie(reply, token);

    return reply.code(201).send({
      success: true,
      data: {
        user: result.user,
        tenant: result.tenant,
      },
    });
  });

  app.post('/logout', async (_request, reply) => {
    return reply.clearCookie('access_token', { path: '/' }).send({ success: true, data: null });
  });

  app.get('/me', { preHandler: authenticate }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      select: {
        ...publicUserSelect,
        isActive: true,
        createdAt: true,
        tenant: {
          select: {
            id: true,
            name: true,
            slug: true,
            plan: true,
            trialEndsAt: true,
            isActive: true,
          },
        },
      },
    });
    if (!user) return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'الحساب غير موجود.', messageEn: 'Account not found.' } });
    return reply.send({ success: true, data: { user } });
  });

  app.post<{ Body: { currentPassword: string; newPassword: string } }>('/change-password', {
    preHandler: [authenticate, app.rateLimit.financial],
    schema: {
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        additionalProperties: false,
        properties: {
          currentPassword: { type: 'string', minLength: 1, maxLength: 200 },
          newPassword: { type: 'string', minLength: 8, maxLength: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const user = await prisma.user.findUnique({ where: { id: request.user.sub }, select: { id: true, passwordHash: true, username: true } });
    if (!user) return reply.code(401).send({ success: false, error: { code: 'UNAUTHORIZED', message: 'الحساب غير موجود.', messageEn: 'Account not found.' } });
    if (!(await argon2.verify(user.passwordHash, request.body.currentPassword))) {
      return reply.code(400).send({ success: false, error: { code: 'INVALID_CURRENT_PASSWORD', message: 'كلمة المرور الحالية غير صحيحة.', messageEn: 'The current password is incorrect.' } });
    }
    if (request.body.newPassword === request.body.currentPassword) {
      return reply.code(400).send({ success: false, error: { code: 'PASSWORD_SAME_AS_CURRENT', message: 'كلمة المرور الجديدة مطابقة لكلمة المرور الحالية.', messageEn: 'The new password must differ from the current one.' } });
    }
    await prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: user.id },
        data: { passwordHash: await argon2.hash(request.body.newPassword, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 }) },
      });
      await recordAuditEntry({ actorId: user.id, shiftRegisterId: null, action: 'PASSWORD_CHANGED', entityType: 'USER', entityId: user.id, metadata: { username: user.username } }, transaction);
    });
    return reply.send({ success: true, data: null });
  });
};

export default authRoutes;
