-- Collapse the tiered plan system into a single unlimited monthly subscription.
--
-- Madar is sold as one product: EGP 1,199/month with no caps on receptionists,
-- branches, desks or visits. There is therefore nothing left for a plan column or
-- a limit column to express, so they are removed outright rather than left as dead
-- values the application would still have to interpret.
--
-- The EGP 1,999 list price and the 40% founding discount are presentation only and
-- live in code (src/shared/constants/offers.ts). No price column is dropped, so
-- `Subscription.amount` history and `SubscriptionAdjustment` rows are untouched.
--
-- This is destructive, and deliberately so:
--   * every tenant is automatically on the single unlimited plan afterwards;
--   * a subscription record no longer names a plan, only its amount and status;
--   * `usage_records` is kept, because it feeds the visits-per-branch report, but
--     it no longer gates anything.

-- 1. Plan-targeted platform notifications can no longer mean anything, since every
--    center is on the same product. Re-target them to everyone rather than deleting
--    a message an operator already wrote.
UPDATE "platform_notifications"
SET "audience" = 'ALL_CENTERS',
    "audience_ids" = '{}',
    "updated_at" = now()
WHERE "audience" = 'PLAN';

-- `ALTER TYPE ... DROP VALUE` is not usable here: it is rejected outright with
-- SQLSTATE 0A000 ("dropping an enum value is not implemented") on PostgreSQL 17,
-- and on 12-16 it is refused inside a transaction block, which is exactly how
-- Prisma runs a migration. Rebuilding the type is the one form that works on
-- every supported server, so the label is removed by swapping the type.
CREATE TYPE "PlatformNotificationAudience__single_product" AS ENUM ('ALL_CENTERS', 'CENTER', 'USER');

ALTER TABLE "platform_notifications"
  ALTER COLUMN "audience" TYPE "PlatformNotificationAudience__single_product"
  USING ("audience"::text::"PlatformNotificationAudience__single_product");

DROP TYPE "PlatformNotificationAudience";
ALTER TYPE "PlatformNotificationAudience__single_product" RENAME TO "PlatformNotificationAudience";

-- 2. The plan and limit columns have no remaining meaning.
ALTER TABLE "subscriptions" DROP COLUMN "plan";
ALTER TABLE "tenants" DROP COLUMN "visit_limit";
ALTER TABLE "tenants" DROP COLUMN "max_users";
ALTER TABLE "tenants" DROP COLUMN "max_branches";
ALTER TABLE "tenants" DROP COLUMN "max_desks";
ALTER TABLE "tenants" DROP COLUMN "plan";

-- 3. `usage_overrides` existed only to grant extra allowance above a limit (extra
--    visits, extra receptionists). With the limits gone there is nothing left to
--    override, so the table and its supporting admin feature go.
DROP TABLE IF EXISTS "usage_overrides";

-- 4. Drop the enum last: the columns that used it are already gone by this point.
DROP TYPE IF EXISTS "TenantPlan";
