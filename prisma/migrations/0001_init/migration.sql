-- ============================================================
-- 0001_init : SaaS multi-tenant Educational Center ERP
-- Generated from prisma/schema.prisma via `prisma migrate diff
--   --from-empty --to-schema-datamodel prisma/schema.prisma`
-- Plus hand-authored extensions/function/indexes required by
-- AGENTS.md (Arabic trigram search) and the duplicate
-- check-in concurrency guard.
-- ============================================================

-- ============================================================
-- Extensions
-- ============================================================
-- pg_trgm: enables GIN trigram similarity indexes for fast Arabic name search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- Arabic Phonetic Normalization Function
-- ============================================================
-- This IMMUTABLE function normalizes Arabic text for consistent
-- trigram-based fuzzy search at the lobby door during rush hours.
--
-- Transformations applied:
--   1. Strip Harakat / Tashkeel  (U+064B–U+065F, U+0670)
--   2. Strip Tatweel / Kashida   (U+0640)
--   3. Normalize Alef variants   (أ إ آ ا -> ا)
--   4. Normalize Taa Marbouta    (ة -> ه)
--   5. Normalize Alef Maksoura   (ى -> ي)
--   6. Collapse multiple spaces  -> single space
--   7. Lowercase (for Latin fallback parity)
--
-- Marked IMMUTABLE so PostgreSQL can use it in functional indexes.
-- ============================================================
CREATE OR REPLACE FUNCTION normalize_arabic(input_text TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN lower(
    trim(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  COALESCE(input_text, ''),
                  '[\u064B-\u065F\u0670]', '', 'g'   -- Strip Harakat/Tashkeel
                ),
                '\u0640', '', 'g'                     -- Strip Tatweel (Kashida)
              ),
              '[\u0623\u0625\u0622]', '\u0627', 'g'  -- Unify Alef variants
            ),
            '\u0629', '\u0647', 'g'                   -- Taa Marbouta -> Haa
          ),
          '\u0649', '\u064A', 'g'                     -- Alef Maksoura -> Yaa
        ),
        '\s+', ' ', 'g'                               -- Collapse whitespace
      )
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT;

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'RECEPTIONIST');

-- CreateEnum
CREATE TYPE "TenantPlan" AS ENUM ('FREE_TRIAL', 'GROWTH', 'BUSINESS', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'VODAFONE_CASH', 'INSTAPAY');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PAID', 'PARTIAL', 'EXCUSED', 'VOID');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING', 'DISBURSED');

-- CreateEnum
CREATE TYPE "SchoolType" AS ENUM ('GENERAL', 'LANGUAGES', 'AZHAR');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "owner_name" TEXT,
    "owner_phone" TEXT,
    "plan" "TenantPlan" NOT NULL DEFAULT 'FREE_TRIAL',
    "trial_ends_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "max_desks" INTEGER NOT NULL DEFAULT 1,
    "max_branches" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "plan" "TenantPlan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EGP',
    "payment_method" "PaymentMethod",
    "payment_reference" TEXT,
    "period_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "period_end" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "username" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'RECEPTIONIST',
    "phone_number" TEXT,
    "preferred_language" TEXT NOT NULL DEFAULT 'ar',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "floor" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teachers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "full_name" TEXT NOT NULL,
    "search_name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "default_center_fee" DECIMAL(65,30) NOT NULL,
    "assistant_name" TEXT,
    "assistant_phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "teachers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "students" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "student_code" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "search_name" TEXT NOT NULL,
    "student_phone" TEXT,
    "guardian_phone" TEXT NOT NULL,
    "academic_stage" TEXT NOT NULL,
    "school_type" "SchoolType" NOT NULL DEFAULT 'GENERAL',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "teacher_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "academic_stage" TEXT NOT NULL,
    "start_time" TIMESTAMP(3) NOT NULL,
    "end_time" TIMESTAMP(3) NOT NULL,
    "session_price" DECIMAL(65,30) NOT NULL,
    "center_fee_per_student" DECIMAL(65,30) NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_registers" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "receptionist_id" TEXT NOT NULL,
    "desk_identifier" TEXT NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "opening_cash" DECIMAL(65,30) NOT NULL DEFAULT 0.00,
    "actual_cash_counted" DECIMAL(65,30),
    "expected_cash" DECIMAL(65,30),
    "cash_variance" DECIMAL(65,30),
    "status" "ShiftStatus" NOT NULL DEFAULT 'OPEN',
    "closing_notes" TEXT,

    CONSTRAINT "shift_registers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "session_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "receptionist_id" TEXT NOT NULL,
    "shift_register_id" TEXT NOT NULL,
    "check_in_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount_paid" DECIMAL(65,30) NOT NULL,
    "change_owed" DECIMAL(65,30) NOT NULL DEFAULT 0.00,
    "payment_method" "PaymentMethod" NOT NULL,
    "payment_reference" TEXT,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PAID',

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_reconciliations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "session_id" TEXT NOT NULL,
    "lobby_count" INTEGER NOT NULL,
    "assistant_count" INTEGER NOT NULL,
    "discrepancy" INTEGER NOT NULL,
    "reconciled_headcount" INTEGER NOT NULL,
    "resolution_notes" TEXT,
    "reconciled_by" TEXT NOT NULL,
    "reconciled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_reconciliations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_settlements" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "session_id" TEXT NOT NULL,
    "reconciliation_id" TEXT NOT NULL,
    "disbursed_from_shift_id" TEXT,
    "reconciled_headcount" INTEGER NOT NULL,
    "session_price" DECIMAL(65,30) NOT NULL,
    "center_fee_per_student" DECIMAL(65,30) NOT NULL,
    "total_revenue" DECIMAL(65,30) NOT NULL,
    "center_revenue" DECIMAL(65,30) NOT NULL,
    "teacher_payout" DECIMAL(65,30) NOT NULL,
    "payout_method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "recipient_name" TEXT NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'DISBURSED',
    "created_by" TEXT NOT NULL,
    "settled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "shift_register_id" TEXT,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "description" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "shift_register_id" TEXT,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "amount" DECIMAL(65,30),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "subscriptions_tenant_id_idx" ON "subscriptions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tenant_id_idx" ON "users"("tenant_id");

-- CreateIndex
CREATE INDEX "rooms_tenant_id_idx" ON "rooms"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_tenant_id_name_key" ON "rooms"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "teachers_tenant_id_search_name_idx" ON "teachers"("tenant_id", "search_name");

-- CreateIndex
CREATE INDEX "teachers_tenant_id_idx" ON "teachers"("tenant_id");

-- CreateIndex
CREATE INDEX "students_tenant_id_search_name_idx" ON "students"("tenant_id", "search_name");

-- CreateIndex
CREATE INDEX "students_tenant_id_student_phone_idx" ON "students"("tenant_id", "student_phone");

-- CreateIndex
CREATE INDEX "students_tenant_id_guardian_phone_idx" ON "students"("tenant_id", "guardian_phone");

-- CreateIndex
CREATE INDEX "students_tenant_id_idx" ON "students"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "students_tenant_id_student_code_key" ON "students"("tenant_id", "student_code");

-- CreateIndex
CREATE INDEX "sessions_tenant_id_status_start_time_end_time_idx" ON "sessions"("tenant_id", "status", "start_time", "end_time");

-- CreateIndex
CREATE INDEX "sessions_tenant_id_idx" ON "sessions"("tenant_id");

-- CreateIndex
CREATE INDEX "sessions_teacher_id_idx" ON "sessions"("teacher_id");

-- CreateIndex
CREATE INDEX "sessions_room_id_idx" ON "sessions"("room_id");

-- CreateIndex
CREATE INDEX "shift_registers_tenant_id_receptionist_id_status_idx" ON "shift_registers"("tenant_id", "receptionist_id", "status");

-- CreateIndex
CREATE INDEX "shift_registers_tenant_id_idx" ON "shift_registers"("tenant_id");

-- CreateIndex
CREATE INDEX "attendances_tenant_id_session_id_student_id_idx" ON "attendances"("tenant_id", "session_id", "student_id");

-- CreateIndex
CREATE INDEX "attendances_tenant_id_idx" ON "attendances"("tenant_id");

-- CreateIndex
CREATE INDEX "attendances_session_id_student_id_idx" ON "attendances"("session_id", "student_id");

-- CreateIndex
CREATE INDEX "attendances_session_id_idx" ON "attendances"("session_id");

-- CreateIndex
CREATE INDEX "attendances_student_id_idx" ON "attendances"("student_id");

-- CreateIndex
CREATE INDEX "attendances_shift_register_id_payment_method_idx" ON "attendances"("shift_register_id", "payment_method");

-- CreateIndex
CREATE UNIQUE INDEX "session_reconciliations_session_id_key" ON "session_reconciliations"("session_id");

-- CreateIndex
CREATE INDEX "session_reconciliations_tenant_id_idx" ON "session_reconciliations"("tenant_id");

-- CreateIndex
CREATE INDEX "session_reconciliations_session_id_idx" ON "session_reconciliations"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_settlements_session_id_key" ON "session_settlements"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "session_settlements_reconciliation_id_key" ON "session_settlements"("reconciliation_id");

-- CreateIndex
CREATE INDEX "session_settlements_tenant_id_idx" ON "session_settlements"("tenant_id");

-- CreateIndex
CREATE INDEX "session_settlements_session_id_idx" ON "session_settlements"("session_id");

-- CreateIndex
CREATE INDEX "session_settlements_disbursed_from_shift_id_idx" ON "session_settlements"("disbursed_from_shift_id");

-- CreateIndex
CREATE INDEX "expenses_tenant_id_shift_register_id_idx" ON "expenses"("tenant_id", "shift_register_id");

-- CreateIndex
CREATE INDEX "expenses_tenant_id_idx" ON "expenses"("tenant_id");

-- CreateIndex
CREATE INDEX "expenses_shift_register_id_idx" ON "expenses"("shift_register_id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_shift_register_id_created_at_idx" ON "audit_logs"("tenant_id", "shift_register_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_shift_register_id_created_at_idx" ON "audit_logs"("shift_register_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teachers" ADD CONSTRAINT "teachers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "students" ADD CONSTRAINT "students_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "teachers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_registers" ADD CONSTRAINT "shift_registers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_registers" ADD CONSTRAINT "shift_registers_receptionist_id_fkey" FOREIGN KEY ("receptionist_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_receptionist_id_fkey" FOREIGN KEY ("receptionist_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_shift_register_id_fkey" FOREIGN KEY ("shift_register_id") REFERENCES "shift_registers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_reconciliations" ADD CONSTRAINT "session_reconciliations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_reconciliations" ADD CONSTRAINT "session_reconciliations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_reconciliations" ADD CONSTRAINT "session_reconciliations_reconciled_by_fkey" FOREIGN KEY ("reconciled_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_settlements" ADD CONSTRAINT "session_settlements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_settlements" ADD CONSTRAINT "session_settlements_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_settlements" ADD CONSTRAINT "session_settlements_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES "session_reconciliations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_settlements" ADD CONSTRAINT "session_settlements_disbursed_from_shift_id_fkey" FOREIGN KEY ("disbursed_from_shift_id") REFERENCES "shift_registers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_settlements" ADD CONSTRAINT "session_settlements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_shift_register_id_fkey" FOREIGN KEY ("shift_register_id") REFERENCES "shift_registers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_shift_register_id_fkey" FOREIGN KEY ("shift_register_id") REFERENCES "shift_registers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================================
-- Hand-authored index layer (preserved from the original 0001/0004)
-- ============================================================

-- ============================================================
-- Functional GIN trigram indexes: sub-15ms fuzzy Arabic name
-- lookups using pg_trgm similarity, even with Alef / Taa Marbouta
-- / diacritic variants in the query string.
-- ============================================================
CREATE INDEX "idx_students_name_trgm"
  ON "students" USING gin (normalize_arabic("full_name") gin_trgm_ops);

CREATE INDEX "idx_teachers_name_trgm"
  ON "teachers" USING gin (normalize_arabic("full_name") gin_trgm_ops);

-- ============================================================
-- Active / Starting-Soon Sessions (Reception Dashboard)
-- Partial index limits scanned rows to only live sessions.
-- ============================================================
CREATE INDEX "idx_sessions_active"
  ON "sessions" ("status", "start_time", "end_time")
  WHERE "status" IN ('SCHEDULED', 'ACTIVE');

-- ============================================================
-- Open Shift Register Lookup by Receptionist
-- Partial index only covers OPEN registers — minimizes index size.
-- ============================================================
CREATE INDEX "idx_shift_registers_open"
  ON "shift_registers" ("receptionist_id", "status")
  WHERE "status" = 'OPEN';

-- ============================================================
-- Strict concurrency guard: a student cannot be checked in twice
-- for the same session across desks. VOIDed check-ins are excluded
-- so a mistaken door check-in can be corrected by checking the
-- student back in.
-- ============================================================
CREATE UNIQUE INDEX "uq_attendance_session_student_nonvoid"
  ON "attendances" ("session_id", "student_id")
  WHERE "status" <> 'VOID';