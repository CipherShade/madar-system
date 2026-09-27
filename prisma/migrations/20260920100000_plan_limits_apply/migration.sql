-- ============================================================
-- 20260920100000_plan_limits_apply
-- Step 2/2: plan-limits columns + re-tier legacy tenants.
--
-- Runs AFTER 20260920000000_plan_tiers_add_enum committed, so the
-- new enum values are usable here.
--
-- Backfill mapping (grandfathering existing capacity):
--   GROWTH      -> ESSENTIAL     (3 users, no visit cap)
--   BUSINESS    -> CONTROL       (10 users, 10,000 visits/mo)
--   ENTERPRISE  -> MULTI_BRANCH  (20 users, 30,000 visits/mo, internal)
-- Existing max_desks remain untouched (grandfathered) — only the
-- new management columns are set. The same remap applies to
-- subscriptions so history matches the current tenant tier.
-- ============================================================

-- New plan-management columns.
ALTER TABLE "tenants" ADD COLUMN "max_users" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "tenants" ADD COLUMN "visit_limit" INTEGER;

-- Legacy re-tier: tenants.
UPDATE "tenants" SET "plan" = 'ESSENTIAL' WHERE "plan" = 'GROWTH';

UPDATE "tenants"
SET "plan" = 'CONTROL', "max_users" = 10, "visit_limit" = 10000
WHERE "plan" = 'BUSINESS';

UPDATE "tenants"
SET "plan" = 'MULTI_BRANCH', "max_users" = 20, "visit_limit" = 30000
WHERE "plan" = 'ENTERPRISE';

-- Legacy re-tier: subscriptions (keeps billing history consistent).
UPDATE "subscriptions" SET "plan" = 'ESSENTIAL' WHERE "plan" = 'GROWTH';
UPDATE "subscriptions" SET "plan" = 'CONTROL' WHERE "plan" = 'BUSINESS';
UPDATE "subscriptions" SET "plan" = 'MULTI_BRANCH' WHERE "plan" = 'ENTERPRISE';