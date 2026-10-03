-- Books & Inventory add-on
--
-- Additive only: creates new tables and touches no existing row, so it is safe
-- to apply to a live center mid-day. An existing center keeps working with an
-- empty inventory and no add-on row until a super admin enables the add-on.
--
-- `subscription_line_items` is new but deliberately left empty for periods that
-- were already invoiced. Back-filling those rows would mean writing historical
-- invoices from today's price list, which is exactly the rewrite this table
-- exists to prevent; readers synthesize a single BASE line from the stored
-- `subscriptions.amount` when a period has none.
--
-- Two invariants below are enforced by the database rather than by the route
-- module, because the one that matters most — stock cannot go negative — is
-- exactly the kind of thing a concurrent checkout can race past in application
-- code. Two desks selling the last copy at the same moment must not both win;
-- if the loser reaches the database, the CHECK below is what stops it.

-- CreateEnum
CREATE TYPE "AddonCode" AS ENUM ('BOOKS_INVENTORY');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE', 'SALE', 'ADJUSTMENT', 'WRITE_OFF', 'RETURN');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('RECORDED', 'VOIDED');

-- CreateTable
CREATE TABLE "subscription_line_items" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label_en" TEXT NOT NULL,
    "label_ar" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_addons" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" "AddonCode" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "enabled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabled_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name_ar" TEXT NOT NULL,
    "name_en" TEXT,
    "search_name" TEXT NOT NULL,
    "sku" TEXT,
    "category_ar" TEXT,
    "sale_price" DECIMAL(65,30) NOT NULL,
    "cost_price" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branch_stocks" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "reorder_level" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branch_stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "delta" INTEGER NOT NULL,
    "unit_cost" DECIMAL(65,30),
    "note" TEXT,
    "sale_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_sales" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "status" "SaleStatus" NOT NULL DEFAULT 'RECORDED',
    "total" DECIMAL(65,30) NOT NULL,
    "cost_total" DECIMAL(65,30) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "shift_register_id" TEXT,
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_sale_lines" (
    "id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(65,30) NOT NULL,
    "unit_cost" DECIMAL(65,30) NOT NULL,
    "line_total" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "book_sale_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subscription_line_items_subscription_id_idx" ON "subscription_line_items"("subscription_id");

-- CreateIndex
CREATE INDEX "tenant_addons_tenant_id_idx" ON "tenant_addons"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_addons_tenant_id_code_key" ON "tenant_addons"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "products_tenant_id_search_name_idx" ON "products"("tenant_id", "search_name");

-- CreateIndex
CREATE INDEX "products_tenant_id_is_active_idx" ON "products"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenant_id_sku_key" ON "products"("tenant_id", "sku");

-- CreateIndex
CREATE INDEX "branch_stocks_tenant_id_branch_id_idx" ON "branch_stocks"("tenant_id", "branch_id");

-- CreateIndex
CREATE UNIQUE INDEX "branch_stocks_branch_id_product_id_key" ON "branch_stocks"("branch_id", "product_id");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_branch_id_product_id_idx" ON "stock_movements"("tenant_id", "branch_id", "product_id");

-- CreateIndex
CREATE INDEX "stock_movements_tenant_id_created_at_idx" ON "stock_movements"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_movements_sale_id_idx" ON "stock_movements"("sale_id");

-- CreateIndex
CREATE INDEX "book_sales_tenant_id_created_at_idx" ON "book_sales"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "book_sales_tenant_id_student_id_idx" ON "book_sales"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "book_sales_tenant_id_branch_id_idx" ON "book_sales"("tenant_id", "branch_id");

-- CreateIndex
CREATE INDEX "book_sales_shift_register_id_idx" ON "book_sales"("shift_register_id");

-- CreateIndex
CREATE INDEX "book_sale_lines_sale_id_idx" ON "book_sale_lines"("sale_id");

-- CreateIndex
CREATE INDEX "book_sale_lines_product_id_idx" ON "book_sale_lines"("product_id");

-- AddForeignKey
ALTER TABLE "subscription_line_items" ADD CONSTRAINT "subscription_line_items_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_addons" ADD CONSTRAINT "tenant_addons_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_stocks" ADD CONSTRAINT "branch_stocks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_stocks" ADD CONSTRAINT "branch_stocks_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branch_stocks" ADD CONSTRAINT "branch_stocks_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "book_sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_sales" ADD CONSTRAINT "book_sales_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_sales" ADD CONSTRAINT "book_sales_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_sales" ADD CONSTRAINT "book_sales_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_sales" ADD CONSTRAINT "book_sales_shift_register_id_fkey" FOREIGN KEY ("shift_register_id") REFERENCES "shift_registers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_sales" ADD CONSTRAINT "book_sales_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_sale_lines" ADD CONSTRAINT "book_sale_lines_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "book_sales"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_sale_lines" ADD CONSTRAINT "book_sale_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Negative on-hand stock would mean the center sold something it does not have.
-- `quantity` is only ever advanced by an atomic `SET quantity = quantity + n`
-- inside the same transaction as the ledger row, so this constraint is the last
-- line of defence, not the mechanism.
ALTER TABLE "branch_stocks"
  ADD CONSTRAINT "branch_stocks_quantity_non_negative" CHECK ("quantity" >= 0);

ALTER TABLE "branch_stocks"
  ADD CONSTRAINT "branch_stocks_reorder_level_non_negative" CHECK ("reorder_level" >= 0);

-- A movement records a positive count of items; the direction lives in `type`
-- and in the signed `delta`. A zero or negative `quantity` would make the ledger
-- impossible to re-sum into the on-hand figure.
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_quantity_positive" CHECK ("quantity" > 0);

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_delta_nonzero" CHECK ("delta" <> 0);

ALTER TABLE "book_sale_lines"
  ADD CONSTRAINT "book_sale_lines_quantity_positive" CHECK ("quantity" > 0);

-- A negative price would corrupt profit reporting rather than fail loudly.
ALTER TABLE "products"
  ADD CONSTRAINT "products_sale_price_non_negative" CHECK ("sale_price" >= 0);

ALTER TABLE "products"
  ADD CONSTRAINT "products_cost_price_non_negative" CHECK ("cost_price" >= 0);

-- A voided sale must say when it was voided, otherwise "why is this not counted"
-- is unanswerable months later.
ALTER TABLE "book_sales"
  ADD CONSTRAINT "book_sales_voided_records_reason"
  CHECK (
    ("status" = 'RECORDED' AND "voided_at" IS NULL)
    OR ("status" = 'VOIDED' AND "voided_at" IS NOT NULL)
  );