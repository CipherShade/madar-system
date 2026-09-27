-- ============================================================
-- 20260925000000_platform_billing_and_users
-- Super-admin control panel, phase 5:
--   1. users.last_login_at          — "last activity" for platform users.
--   2. tenants.discount_balance     — walletable discount granted by the owner.
--      tenants.credit_balance       — walletable credit granted by the owner.
--   3. subscription_adjustments     — immutable ledger of DISCOUNT / CREDIT /
--      REFUND decisions made from the super-admin console.
--
-- The two tenant balance columns are the live wallet; the ledger is the
-- history. Balances are consumed when a new pending subscription amount is
-- computed, never by mutating past subscription rows (historical
-- financial immutability).
-- ============================================================

-- CreateEnum
CREATE TYPE "SubscriptionAdjustmentType" AS ENUM ('DISCOUNT', 'CREDIT', 'REFUND');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "discount_balance" DECIMAL NOT NULL DEFAULT 0,
ADD COLUMN "credit_balance" DECIMAL NOT NULL DEFAULT 0;

-- Normalized name columns so platform-wide search matches "احمد" against
-- "أحمد" / "إحمد" / "آحمد" (same normalization the app uses on write).
ALTER TABLE "tenants" ADD COLUMN "search_name" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN "last_login_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN "search_name" TEXT;

-- Backfill: translate() maps Alef variants, Taa Marbouta and Alef Maksoura in
-- one pass; whitespace is collapsed. Tashkeel/tatweel are not stripped here
-- (rare in stored names) but the search term is normalized on read.
UPDATE "tenants"
SET "search_name" = btrim(regexp_replace(translate(lower(COALESCE("name", '')), 'أإآةى', 'اااهي'), '[[:space:]]+', ' ', 'g'));

UPDATE "users"
SET "search_name" = btrim(regexp_replace(translate(lower(COALESCE("full_name", '')), 'أإآةى', 'اااهي'), '[[:space:]]+', ' ', 'g'));

-- CreateTable
CREATE TABLE "subscription_adjustments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "type" "SubscriptionAdjustmentType" NOT NULL,
    "amount" DECIMAL NOT NULL,
    "reason" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_adjustments_tenant_id_idx" ON "subscription_adjustments"("tenant_id");

-- CreateIndex
CREATE INDEX "subscription_adjustments_subscription_id_idx" ON "subscription_adjustments"("subscription_id");

-- CreateIndex
CREATE INDEX "subscription_adjustments_type_idx" ON "subscription_adjustments"("type");

-- AddForeignKey
ALTER TABLE "subscription_adjustments" ADD CONSTRAINT "subscription_adjustments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_adjustments" ADD CONSTRAINT "subscription_adjustments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_adjustments" ADD CONSTRAINT "subscription_adjustments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
