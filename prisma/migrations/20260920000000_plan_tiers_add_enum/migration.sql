-- ============================================================
-- 20260920000000_plan_tiers_add_enum
-- Step 1/2: append the new TenantPlan values.
--
-- PostgreSQL allows `ALTER TYPE ... ADD VALUE` inside a
-- transaction block, but the newly added value CANNOT be USED
-- until that transaction commits. Backfilling with the new
-- values therefore lives in its own migration
-- (20260920100000_plan_limits_apply) which runs afterwards.
--
-- Values are appended AFTER the legacy set so the database order
-- matches prisma/schema.prisma exactly (Prisma will otherwise
-- insist on dropping/recreating the enum).
-- ============================================================

ALTER TYPE "TenantPlan" ADD VALUE IF NOT EXISTS 'ESSENTIAL';
ALTER TYPE "TenantPlan" ADD VALUE IF NOT EXISTS 'CONTROL';
ALTER TYPE "TenantPlan" ADD VALUE IF NOT EXISTS 'MULTI_BRANCH';