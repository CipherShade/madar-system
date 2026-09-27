-- CreateEnum
CREATE TYPE "SupportNoteStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "PlatformNotificationAudience" AS ENUM ('ALL_CENTERS', 'PLAN', 'CENTER', 'USER');

-- CreateEnum
CREATE TYPE "PlatformNotificationStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SystemHealthLevel" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "support_notes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "SupportNoteStatus" NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "support_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_notifications" (
    "id" TEXT NOT NULL,
    "title_ar" TEXT NOT NULL,
    "body_ar" TEXT NOT NULL,
    "audience" "PlatformNotificationAudience" NOT NULL,
    "audience_ids" TEXT[],
    "status" "PlatformNotificationStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "super_admin_audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT,
    "entity_id" TEXT,
    "before_json" JSONB,
    "after_json" JSONB,
    "reason" TEXT,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "super_admin_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_overrides" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "extra_amount" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "expires_at" TIMESTAMP(3),
    "granted_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "super_admin_sessions" (
    "id" TEXT NOT NULL,
    "admin_user_id" TEXT NOT NULL,
    "impersonating_tenant_id" TEXT,
    "reason" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "super_admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_health_events" (
    "id" TEXT NOT NULL,
    "level" "SystemHealthLevel" NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "tenant_id" TEXT,
    "meta" JSONB,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_health_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "super_admin_permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description_ar" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "super_admin_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "super_admin_user_permissions" (
    "id" TEXT NOT NULL,
    "admin_user_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "super_admin_user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_notes_tenant_id_idx" ON "support_notes"("tenant_id");

-- CreateIndex
CREATE INDEX "support_notes_author_id_idx" ON "support_notes"("author_id");

-- CreateIndex
CREATE INDEX "support_notes_status_idx" ON "support_notes"("status");

-- CreateIndex
CREATE INDEX "platform_notifications_audience_idx" ON "platform_notifications"("audience");

-- CreateIndex
CREATE INDEX "platform_notifications_status_idx" ON "platform_notifications"("status");

-- CreateIndex
CREATE INDEX "platform_notifications_created_by_id_idx" ON "platform_notifications"("created_by_id");

-- CreateIndex
CREATE INDEX "super_admin_audit_logs_actor_id_idx" ON "super_admin_audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "super_admin_audit_logs_tenant_id_idx" ON "super_admin_audit_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "super_admin_audit_logs_action_idx" ON "super_admin_audit_logs"("action");

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_key_key" ON "system_settings"("key");

-- CreateIndex
CREATE INDEX "usage_overrides_tenant_id_idx" ON "usage_overrides"("tenant_id");

-- CreateIndex
CREATE INDEX "usage_overrides_metric_idx" ON "usage_overrides"("metric");

-- CreateIndex
CREATE INDEX "super_admin_sessions_admin_user_id_idx" ON "super_admin_sessions"("admin_user_id");

-- CreateIndex
CREATE INDEX "super_admin_sessions_impersonating_tenant_id_idx" ON "super_admin_sessions"("impersonating_tenant_id");

-- CreateIndex
CREATE INDEX "system_health_events_level_idx" ON "system_health_events"("level");

-- CreateIndex
CREATE INDEX "system_health_events_category_idx" ON "system_health_events"("category");

-- CreateIndex
CREATE INDEX "system_health_events_tenant_id_idx" ON "system_health_events"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "super_admin_permissions_key_key" ON "super_admin_permissions"("key");

-- CreateIndex
CREATE UNIQUE INDEX "super_admin_user_permissions_admin_user_id_permission_id_key" ON "super_admin_user_permissions"("admin_user_id", "permission_id");

-- AddForeignKey
ALTER TABLE "support_notes" ADD CONSTRAINT "support_notes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "support_notes" ADD CONSTRAINT "support_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_notifications" ADD CONSTRAINT "platform_notifications_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "super_admin_audit_logs" ADD CONSTRAINT "super_admin_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "super_admin_audit_logs" ADD CONSTRAINT "super_admin_audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_overrides" ADD CONSTRAINT "usage_overrides_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_overrides" ADD CONSTRAINT "usage_overrides_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "super_admin_sessions" ADD CONSTRAINT "super_admin_sessions_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "super_admin_sessions" ADD CONSTRAINT "super_admin_sessions_impersonating_tenant_id_fkey" FOREIGN KEY ("impersonating_tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "system_health_events" ADD CONSTRAINT "system_health_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "super_admin_user_permissions" ADD CONSTRAINT "super_admin_user_permissions_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "super_admin_user_permissions" ADD CONSTRAINT "super_admin_user_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "super_admin_permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

