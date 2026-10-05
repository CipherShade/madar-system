-- Tenant ownership can no longer be missing on a core business record.
--
-- Every core row belongs to exactly one center. The application always wrote
-- `tenantId`, but the column was nullable, which made an unowned `students` row
-- or `attendances` row representable: it would sit in no tenant's scope, so no
-- center's report would ever include it, and no per-tenant index would find it.
-- `SET NOT NULL` fails the migration rather than discarding such a row, so an
-- orphan is reported instead of quietly deleted.
--
-- `users`, `audit_logs`, `system_health_events`, and `super_admin_audit_logs`
-- are deliberately left nullable: the platform super admin has no tenant, and
-- platform-wide audit and health rows legitimately have none either.
--
-- These take an ACCESS EXCLUSIVE lock and scan the table. On a large table,
-- promote them to `ADD CONSTRAINT ... CHECK (tenant_id IS NOT NULL) NOT VALID`
-- + `VALIDATE CONSTRAINT` before `SET NOT NULL` to avoid holding the lock for
-- the whole scan.

ALTER TABLE "attendances" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "expenses" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "rooms" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "session_reconciliations" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "session_settlements" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "sessions" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "shift_registers" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "students" ALTER COLUMN "tenant_id" SET NOT NULL;
ALTER TABLE "teachers" ALTER COLUMN "tenant_id" SET NOT NULL;

-- A room's branch must be the same center's branch, and a branch that still
-- holds rooms must not be deletable.
--
-- `rooms.branch_id` was `ON DELETE SET NULL`, which contradicts the branch
-- delete route: it answers "cannot delete branch associated with rooms or
-- sessions", but the database would have accepted the delete and silently
-- detached every room, losing which branch each room bills against. `RESTRICT`
-- makes the route's promise the database's behaviour.
--
-- Cross-tenant assignment is still the application's job — a branch from
-- another center is a valid row, so no foreign key can reject it. `POST/PATCH
-- /api/management/rooms` resolve `branchId` against the caller's tenant and
-- answer 404 BRANCH_NOT_FOUND otherwise.
ALTER TABLE "rooms" DROP CONSTRAINT "rooms_branch_id_fkey";
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
