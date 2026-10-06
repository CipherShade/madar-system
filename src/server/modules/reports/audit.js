import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
export function recordAuditEntry(input, client = prisma) {
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
