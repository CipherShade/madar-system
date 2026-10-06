import { prisma } from '../../lib/prisma.js';
export function recordSuperAdminAudit(input, client = prisma) {
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
