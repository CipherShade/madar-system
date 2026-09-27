import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export type SuperAdminAuditEntryInput = {
  actorId: string;
  tenantId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  beforeJson?: Prisma.InputJsonValue | null;
  afterJson?: Prisma.InputJsonValue | null;
  reason?: string | null;
  ip?: string | null;
};

export function recordSuperAdminAudit(
  input: SuperAdminAuditEntryInput,
  client: PrismaClient | Prisma.TransactionClient = prisma,
) {
  return client.superAdminAuditLog.create({
    data: {
      actorId: input.actorId,
      tenantId: input.tenantId ?? null,
      action: input.action,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      beforeJson: input.beforeJson ?? undefined,
      afterJson: input.afterJson ?? undefined,
      reason: input.reason ?? null,
      ip: input.ip ?? null,
    },
  });
}
