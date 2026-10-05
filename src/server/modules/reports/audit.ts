import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export type AuditEntryInput = {
  /**
   * The center the entry belongs to. Optional because super-admin platform
   * actions are not tied to one center, but a tenant route must pass it: an
   * audit row without an owner is invisible to every tenant-scoped query, which
   * is how a drawer balance goes missing without anything looking broken.
   */
  tenantId?: string | null;
  shiftRegisterId?: string | null;
  actorId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  amount?: number | null;
  metadata?: Prisma.InputJsonValue | null;
};

export function recordAuditEntry(input: AuditEntryInput, client: PrismaClient | Prisma.TransactionClient = prisma) {
  return client.auditLog.create({
    data: {
      tenantId: input.tenantId ?? null,
      shiftRegisterId: input.shiftRegisterId ?? null,
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      amount: input.amount === undefined || input.amount === null ? null : new Prisma.Decimal(input.amount),
      metadata: input.metadata ?? undefined,
    },
  });
}