import type { FastifyPluginAsync } from 'fastify';
import { Prisma } from '@prisma/client';
import { Role } from '../../../shared/constants/index.js';
import { canAddBranch } from '../../../shared/constants/plans.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requireRoles } from '../auth/auth.js';
import { requireTenantWritable } from '../../lib/tenantLifecycle.js';
import { isValidUUID } from '../../lib/http.js';
import { recordAuditEntry } from '../reports/audit.js';

const egyptianPhone = /^(010|011|012|015)[0-9]{8}$/;

type BranchBody = {
  name: string;
  address?: string | null;
  phoneNumber?: string | null;
  isActive?: boolean;
};

const branchSchema = {
  type: 'object',
  required: ['name'],
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 100 },
    address: { type: ['string', 'null'], maxLength: 200 },
    phoneNumber: { type: ['string', 'null'], pattern: '^(010|011|012|015)[0-9]{8}$' },
    isActive: { type: 'boolean' },
  },
} as const;

function invalid(message: string, messageEn: string, code = 'VALIDATION_ERROR') {
  return { success: false, error: { code, message, messageEn } };
}

const branchRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: authenticate }, async (request, reply) => {
    const tenantId = request.user?.tenantId;
    if (!tenantId) {
      return reply.send({ success: true, data: { branches: [] } });
    }

    const branches = await prisma.branch.findMany({
      where: { tenantId },
      include: {
        _count: { select: { rooms: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return reply.send({
      success: true,
      data: {
        branches: branches.map((b) => ({
          id: b.id,
          name: b.name,
          address: b.address,
          phoneNumber: b.phoneNumber,
          isActive: b.isActive,
          roomCount: b._count.rooms,
          createdAt: b.createdAt.toISOString(),
        })),
      },
    });
  });

  app.post<{ Body: BranchBody }>('/', {
    preHandler: [authenticate, requireRoles(Role.ADMIN), requireTenantWritable],
    schema: { body: branchSchema },
  }, async (request, reply) => {
    const tenantId = request.user?.tenantId;
    if (!tenantId) {
      return reply.code(400).send(invalid('الحساب غير مرتبط بمركز تعليمي.', 'Account has no tenant assigned.', 'TENANT_REQUIRED'));
    }

    if (request.body.phoneNumber && !egyptianPhone.test(request.body.phoneNumber)) {
      return reply.code(400).send(invalid('رقم الهاتف يجب أن يكون رقم محمول مصري صحيح.', 'Use a valid Egyptian mobile number.'));
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { plan: true },
    });

    const currentCount = await prisma.branch.count({
      where: { tenantId, isActive: true },
    });

    // Enforce server-side branch limit
    if (!canAddBranch(currentCount, tenant?.plan)) {
      return reply.code(403).send({
        success: false,
        error: {
          code: 'BRANCH_LIMIT_REACHED',
          message: 'إضافة أكثر من فرع متاحة في باقة Multi-Branch.',
          messageEn: 'Adding more than 1 branch is only available on the Multi-Branch plan.',
          cta: 'UPGRADE_PLAN',
        },
      });
    }

    try {
      const branch = await prisma.$transaction(async (tx) => {
        const created = await tx.branch.create({
          data: {
            tenantId,
            name: request.body.name.trim(),
            address: request.body.address?.trim() || null,
            phoneNumber: request.body.phoneNumber || null,
            isActive: request.body.isActive ?? true,
          },
        });

        await recordAuditEntry({
          actorId: request.user.sub,
          shiftRegisterId: null,
          action: 'BRANCH_CREATED',
          entityType: 'BRANCH',
          entityId: created.id,
          metadata: { name: created.name },
        }, tx);

        return created;
      });

      return reply.code(201).send({
        success: true,
        data: { branch },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return reply.code(409).send(invalid('اسم الفرع مسجل بالفعل في هذا المركز.', 'A branch with this name already exists in your center.'));
      }
      throw error;
    }
  });

  app.patch<{ Params: { id: string }; Body: Partial<BranchBody> }>('/:id', {
    preHandler: [authenticate, requireRoles(Role.ADMIN), requireTenantWritable],
    schema: { body: { ...branchSchema, required: [] } },
  }, async (request, reply) => {
    if (!isValidUUID(request.params.id)) {
      return reply.code(400).send(invalid('معرّف الفرع غير صالح.', 'The branch id is invalid.'));
    }

    const tenantId = request.user?.tenantId;
    if (request.body.phoneNumber && !egyptianPhone.test(request.body.phoneNumber)) {
      return reply.code(400).send(invalid('رقم الهاتف يجب أن يكون رقم محمول مصري صحيح.', 'Use a valid Egyptian mobile number.'));
    }

    // If reactivating a branch, verify branch limits
    if (tenantId && request.body.isActive === true) {
      const existing = await prisma.branch.findUnique({ where: { id: request.params.id }, select: { isActive: true } });
      if (existing && !existing.isActive) {
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
        const currentCount = await prisma.branch.count({ where: { tenantId, isActive: true } });
        if (!canAddBranch(currentCount, tenant?.plan)) {
          return reply.code(403).send({
            success: false,
            error: {
              code: 'BRANCH_LIMIT_REACHED',
              message: 'إضافة أكثر من فرع متاحة في باقة Multi-Branch.',
              messageEn: 'Adding more than 1 branch is only available on the Multi-Branch plan.',
              cta: 'UPGRADE_PLAN',
            },
          });
        }
      }
    }

    try {
      const branch = await prisma.$transaction(async (tx) => {
        const updated = await tx.branch.update({
          where: { id: request.params.id },
          data: {
            ...(request.body.name === undefined ? {} : { name: request.body.name.trim() }),
            ...(request.body.address === undefined ? {} : { address: request.body.address?.trim() || null }),
            ...(request.body.phoneNumber === undefined ? {} : { phoneNumber: request.body.phoneNumber || null }),
            ...(request.body.isActive === undefined ? {} : { isActive: request.body.isActive }),
          },
        });

        await recordAuditEntry({
          actorId: request.user.sub,
          shiftRegisterId: null,
          action: 'BRANCH_UPDATED',
          entityType: 'BRANCH',
          entityId: updated.id,
          metadata: { name: updated.name },
        }, tx);

        return updated;
      });

      return reply.send({ success: true, data: { branch } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return reply.code(404).send(invalid('الفرع غير موجود.', 'Branch not found.'));
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return reply.code(409).send(invalid('اسم الفرع مسجل بالفعل في هذا المركز.', 'A branch with this name already exists in your center.'));
      }
      throw error;
    }
  });

  app.delete<{ Params: { id: string } }>('/:id', {
    preHandler: [authenticate, requireRoles(Role.ADMIN), requireTenantWritable],
  }, async (request, reply) => {
    if (!isValidUUID(request.params.id)) {
      return reply.code(400).send(invalid('معرّف الفرع غير صالح.', 'The branch id is invalid.'));
    }

    try {
      await prisma.$transaction(async (tx) => {
        await tx.branch.delete({ where: { id: request.params.id } });
        await recordAuditEntry({
          actorId: request.user.sub,
          shiftRegisterId: null,
          action: 'BRANCH_DELETED',
          entityType: 'BRANCH',
          entityId: request.params.id,
        }, tx);
      });

      return reply.send({ success: true, data: null });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return reply.code(404).send(invalid('الفرع غير موجود.', 'Branch not found.'));
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        return reply.code(409).send(invalid('لا يمكن حذف فرع مرتبط بقاعات أو حصص.', 'Cannot delete branch associated with rooms or sessions.'));
      }
      throw error;
    }
  });
};

export default branchRoutes;
