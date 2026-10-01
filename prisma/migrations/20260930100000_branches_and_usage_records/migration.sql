-- Branches, per-branch usage records, and the money-column precision fix.
--
-- `branches` and `usage_records` are declared in prisma/schema.prisma and used by
-- the application (src/server/modules/management/branches.ts, the branch-usage
-- column of the visits report, the unlimited-branches copy on the landing page),
-- but no migration in this repository ever created them. A database built purely
-- by `prisma migrate deploy` therefore came out missing two tables and the
-- `rooms.branch_id` column, and the first insert into `rooms` failed with
-- "column rooms.branch_id does not exist".
--
-- The three money columns below are corrected in the same pass because they were
-- created as bare `DECIMAL` (unconstrained NUMERIC in PostgreSQL) rather than the
-- `DECIMAL(65,30)` that Prisma's `Decimal` maps to and that every other money
-- column in 0001_init already uses. Narrowing them makes the schema self-consistent
-- and stops `prisma migrate diff` reporting permanent drift.

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN "branch_id" TEXT;

-- AlterTable
ALTER TABLE "subscription_adjustments" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(65,30);

-- AlterTable
ALTER TABLE "tenants" ALTER COLUMN "discount_balance" SET DATA TYPE DECIMAL(65,30),
ALTER COLUMN "credit_balance" SET DATA TYPE DECIMAL(65,30);

-- CreateTable
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone_number" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "visit_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "branches_tenant_id_idx" ON "branches"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "branches_tenant_id_name_key" ON "branches"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "usage_records_tenant_id_period_start_period_end_idx" ON "usage_records"("tenant_id", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "usage_records_tenant_id_branch_id_period_start_period_end_key" ON "usage_records"("tenant_id", "branch_id", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "rooms_branch_id_idx" ON "rooms"("branch_id");

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
