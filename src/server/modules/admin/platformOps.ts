/**
 * Madar Platform Operations API (Super Admin control panel — Phase 4).
 *
 * Covers: Notifications, Feature Flags, System Health, Platform Settings,
 * Data & Backup, Security, My Account, and the Super-Admin Audit Log.
 *
 * Every route is gated to SUPER_ADMIN only. No tenantId scoping applies to the
 * read paths here (cross-tenant visibility is the point of this plugin), but
 * every mutating action is written to SuperAdminAuditLog.
 */

import { Prisma } from '@prisma/client';
import argon2 from 'argon2';
import type { SupportNoteStatus } from '@prisma/client';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { Role } from '../../../shared/constants/index.js';
import { config } from '../../config/index.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requireRoles } from '../auth/auth.js';
import { recordSuperAdminAudit } from './audit.js';
import { USAGE_METRICS } from './billingMath.js';
import { fail, toInt } from './platformHelpers.js';

const SUPER_ADMIN_GATE = [authenticate, requireRoles(Role.SUPER_ADMIN)];

// ─── Catalogs ────────────────────────────────────────────────────────────────

export const FEATURE_FLAG_CATALOG = [
  { key: 'reception_ui_v2', labelAr: 'واجهة الاستقبال الجديدة', descriptionAr: 'الواجهة الحديثة لشاشة الاستقبال والمكاتب.' },
  { key: 'advanced_reports', labelAr: 'التقارير المتقدمة', descriptionAr: 'تقارير تحليلية موسّعة للمدار.' },
  { key: 'multi_branch', labelAr: 'متعدد الفروع', descriptionAr: 'إدارة أكثر من فرع من حساب واحد.' },
  { key: 'teacher_analytics', labelAr: 'تحليلات المدرسين', descriptionAr: 'مؤشرات أداء وتحليل ترددي للمدرسين.' },
  { key: 'experimental_features', labelAr: 'ميزات تجريبية', descriptionAr: 'تجارب غير مستقرة — فعّلها على مركز محدد فقط.' },
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_CATALOG)[number]['key'];

const FEATURE_FLAG_KEYS = new Set<string>(FEATURE_FLAG_CATALOG.map((f) => f.key));

const FLAG_SETTING_PREFIX = 'flag:';

type FeatureFlagValue = {
  enabled: boolean;
  plans: Record<string, boolean>;
  centers: Record<string, boolean>;
};

const DEFAULT_FLAG_VALUE: FeatureFlagValue = { enabled: false, plans: {}, centers: {} };

type SettingKind = 'string' | 'number' | 'boolean' | 'json';

const SETTINGS_CATALOG: Record<string, { kind: SettingKind; default: Prisma.InputJsonValue }> = {
  'platform.name': { kind: 'string', default: 'مدار' },
  'platform.currency': { kind: 'string', default: 'EGP' },
  'platform.timezone': { kind: 'string', default: 'Africa/Cairo' },
  'platform.contactEmail': { kind: 'string', default: '' },
  'platform.contactPhone': { kind: 'string', default: '' },
  'platform.trialDays': { kind: 'number', default: 14 },
  'platform.registrationOpen': { kind: 'boolean', default: true },
  'platform.maintenanceMode': { kind: 'boolean', default: false },
  'platform.maintenanceMessageAr': { kind: 'string', default: '' },
  'platform.defaultLimits': {
    kind: 'json',
    default: { maxDesks: 1, maxBranches: 1, maxUsers: 3, visitLimit: null },
  },
};

const SETTING_KEYS = Object.keys(SETTINGS_CATALOG);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readFlagValue(raw: Prisma.JsonValue | null | undefined): FeatureFlagValue {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_FLAG_VALUE, plans: {}, centers: {} };
  const source = raw as Record<string, unknown>;
  return {
    enabled: source.enabled === true,
    plans: typeof source.plans === 'object' && source.plans !== null && !Array.isArray(source.plans)
      ? Object.fromEntries(Object.entries(source.plans as Record<string, unknown>).map(([k, v]) => [k, v === true]))
      : {},
    centers: typeof source.centers === 'object' && source.centers !== null && !Array.isArray(source.centers)
      ? Object.fromEntries(Object.entries(source.centers as Record<string, unknown>).map(([k, v]) => [k, v === true]))
      : {},
  };
}

function validateSettingValue(key: string, value: unknown): string | null {
  const spec = SETTINGS_CATALOG[key];
  if (!spec) return `المفتاح "${key}" غير معروف.`;
  if (spec.kind === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 'يجب أن تكون القيمة رقمًا.';
  } else if (spec.kind === 'boolean') {
    if (typeof value !== 'boolean') return 'يجب أن تكون القيمة صح أو خطأ.';
  } else if (spec.kind === 'string') {
    if (typeof value !== 'string' || value.length > 500) return 'يجب أن تكون القيمة نصًا لا يتجاوز 500 حرف.';
  } else {
    if (value === null || typeof value !== 'object') return 'يجب أن تكون القيمة كائن JSON صالح.';
  }
  return null;
}

function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const escape = (value: unknown) => {
    if (value === null || value === undefined) return '';
    const text = value instanceof Date ? value.toISOString() : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns.join(','), ...rows.map((row) => columns.map((column) => escape(row[column])).join(','))].join('\n');
}

async function countRows() {
  const [
    tenants, users, students, teachers, rooms, sessions,
    attendances, subscriptions, auditLogs, supportNotes, notifications,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.user.count(),
    prisma.student.count(),
    prisma.teacher.count(),
    prisma.room.count(),
    prisma.session.count(),
    prisma.attendance.count(),
    prisma.subscription.count(),
    prisma.auditLog.count(),
    prisma.supportNote.count(),
    prisma.platformNotification.count(),
  ]);
  return { tenants, users, students, teachers, rooms, sessions, attendances, subscriptions, auditLogs, supportNotes, notifications };
}

async function migrationState() {
  const applied = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
  const failed = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*)::bigint AS count FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL`;
  return {
    applied: Number(applied[0]?.count ?? 0),
    failed: Number(failed[0]?.count ?? 0),
  };
}

async function databaseSizeBytes(): Promise<number | null> {
  try {
    const rows = await prisma.$queryRaw<{ bytes: bigint }[]>`SELECT pg_database_size(current_database())::bigint AS bytes`;
    return Number(rows[0]?.bytes ?? 0);
  } catch {
    return null;
  }
}

type HealthCheckResult = {
  key: string;
  labelAr: string;
  level: 'INFO' | 'WARNING' | 'CRITICAL';
  ok: boolean;
  detailAr: string;
  value?: string | number | null;
  latencyMs?: number | null;
};

async function runHealthChecks(request: FastifyRequest): Promise<HealthCheckResult[]> {
  const checks: HealthCheckResult[] = [];

  const dbStarted = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({
      key: 'database', labelAr: 'قاعدة البيانات', level: 'INFO', ok: true,
      detailAr: 'الاتصال بقاعدة البيانات يعمل بشكل طبيعي.',
      latencyMs: Date.now() - dbStarted,
    });
  } catch (error) {
    checks.push({
      key: 'database', labelAr: 'قاعدة البيانات', level: 'CRITICAL', ok: false,
      detailAr: 'تعذر الاتصال بقاعدة البيانات.', value: error instanceof Error ? error.message : 'unknown',
      latencyMs: Date.now() - dbStarted,
    });
  }

  const memory = process.memoryUsage();
  const heapMb = Math.round(memory.heapUsed / 1024 / 1024);
  const rssMb = Math.round(memory.rss / 1024 / 1024);
  checks.push({
    key: 'process', labelAr: 'العملية', level: 'INFO', ok: true,
    detailAr: `زمن التشغيل ${formatDuration(process.uptime())} · ذاكرة الكومة ${heapMb} ميجابايت.`,
    value: rssMb, latencyMs: heapMb,
  });

  const io = request.server.io;
  const clientsCount = io?.engine?.clientsCount;
  checks.push({
    key: 'socket', labelAr: 'الوصول اللحظي (Socket)',
    level: clientsCount === undefined ? 'WARNING' : 'INFO',
    ok: clientsCount !== undefined,
    detailAr: clientsCount === undefined
      ? 'خادم Socket غير مربوط في هذه العملية.'
      : `عدد الاتصالات اللحظية ${clientsCount}.`,
    value: clientsCount ?? null,
  });

  try {
    const migrations = await migrationState();
    checks.push({
      key: 'migrations', labelAr: 'الترحيلات (Migrations)',
      level: migrations.failed > 0 ? 'CRITICAL' : 'INFO',
      ok: migrations.failed === 0,
      detailAr: migrations.failed > 0
        ? `يوجد ${migrations.failed} ترحيل غير مكتمل.`
        : `تم تطبيق ${migrations.applied} ترحيل بنجاح.`,
      value: migrations.applied,
    });
  } catch (error) {
    checks.push({
      key: 'migrations', labelAr: 'الترحيلات (Migrations)', level: 'WARNING', ok: false,
      detailAr: 'تعذر قراءة سجل الترحيلات من قاعدة البيانات.', value: error instanceof Error ? error.message : 'unknown',
    });
  }

  const jwtUsable = typeof config.jwtSecret === 'string' && config.jwtSecret.length >= 16;
  checks.push({
    key: 'auth', labelAr: 'المصادقة (JWT)', level: jwtUsable ? 'INFO' : 'CRITICAL', ok: jwtUsable,
    detailAr: jwtUsable
      ? 'مفتاح توقيع الجلسات مضبوط ويمكن التحقق من الرموز.'
      : 'مفتاح توقيع الجلسات غير مضبوط أو قصير جدًا.',
  });

  return checks;
}

function formatDuration(seconds: number): string {
  const total = Math.floor(seconds);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return `${days} يوم و ${hours} ساعة`;
  if (hours > 0) return `${hours} ساعة و ${minutes} دقيقة`;
  return `${minutes} دقيقة`;
}

const healthCheckLabelAr: Record<string, string> = {
  database: 'قاعدة البيانات',
  process: 'العملية',
  socket: 'الوصول اللحظي (Socket)',
  migrations: 'الترحيلات (Migrations)',
  auth: 'المصادقة (JWT)',
};

export function healthLevelForFailure(key: string): 'WARNING' | 'CRITICAL' {
  return key === 'socket' || key === 'migrations' ? 'WARNING' : 'CRITICAL';
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

const platformOpsRoutes: FastifyPluginAsync = async (app) => {
  // ═══ NOTIFICATIONS ═══════════════════════════════════════════════════════

  app.get<{ Querystring: { status?: string; limit?: string } }>(
    '/notifications',
    { preHandler: SUPER_ADMIN_GATE },
    async (request, reply) => {
      const limit = toInt(request.query.limit, 100, 1, 200);
      const status = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'ARCHIVED'].includes(request.query.status ?? '')
        ? (request.query.status as Prisma.PlatformNotificationWhereInput['status'])
        : undefined;

      const notifications = await prisma.platformNotification.findMany({
        where: status ? { status } : {},
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { createdBy: { select: { id: true, fullName: true, username: true } } },
      });

      const [total, activeCount] = await Promise.all([
        prisma.platformNotification.count(),
        prisma.platformNotification.count({ where: { status: 'ACTIVE' } }),
      ]);

      return reply.send({
        success: true,
        data: { notifications, pagination: { total, activeCount } },
      });
    },
  );

  app.post<{
    Body: {
      titleAr: string;
      bodyAr: string;
      audience: 'ALL_CENTERS' | 'PLAN' | 'CENTER' | 'USER';
      audienceIds?: string[];
      publishNow?: boolean;
    };
  }>(
    '/notifications',
    {
      preHandler: SUPER_ADMIN_GATE,
      schema: {
        body: {
          type: 'object',
          required: ['titleAr', 'bodyAr', 'audience'],
          additionalProperties: false,
          properties: {
            titleAr: { type: 'string', minLength: 2, maxLength: 200 },
            bodyAr: { type: 'string', minLength: 2, maxLength: 2000 },
            audience: { type: 'string', enum: ['ALL_CENTERS', 'PLAN', 'CENTER', 'USER'] },
            audienceIds: { type: 'array', maxItems: 500, items: { type: 'string', maxLength: 64 } },
            publishNow: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) => {
      const { titleAr, bodyAr, audience, audienceIds, publishNow } = request.body;

      if (audience !== 'ALL_CENTERS' && (!audienceIds || audienceIds.length === 0)) {
        return fail(reply, 400, 'AUDIENCE_IDS_REQUIRED', 'يجب تحديد المستهدفين لهذا النوع من الإشعارات.', 'Audience targets are required for this notification type.');
      }

      if (audience === 'CENTER' && audienceIds) {
        const found = await prisma.tenant.count({ where: { id: { in: audienceIds } } });
        if (found !== audienceIds.length) {
          return fail(reply, 400, 'UNKNOWN_CENTER', 'بعض المراكز المحددة غير موجودة.', 'One or more selected centers do not exist.');
        }
      }

      const now = new Date();
      const status = publishNow ? 'ACTIVE' : 'DRAFT';

      const notification = await prisma.$transaction(async (tx) => {
        const created = await tx.platformNotification.create({
          data: {
            titleAr: titleAr.trim(),
            bodyAr: bodyAr.trim(),
            audience,
            audienceIds: audienceIds ?? [],
            status,
            sentAt: publishNow ? now : null,
            createdById: request.user.sub,
          },
        });

        await recordSuperAdminAudit(
          {
            actorId: request.user.sub,
            action: 'PLATFORM_NOTIFICATION_CREATED',
            entityType: 'PlatformNotification',
            entityId: created.id,
            afterJson: { audience, audienceCount: audienceIds?.length ?? 0, status, publishNow: publishNow === true },
            ip: request.ip ?? null,
          },
          tx,
        );

        return created;
      });

      return reply.code(201).send({ success: true, data: notification });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/notifications/:id/send',
    { preHandler: SUPER_ADMIN_GATE },
    async (request, reply) => {
      const existing = await prisma.platformNotification.findUnique({ where: { id: request.params.id } });
      if (!existing) return fail(reply, 404, 'NOTIFICATION_NOT_FOUND', 'الإشعار غير موجود.', 'Notification not found.');

      if (existing.audience === 'CENTER' && existing.audienceIds.length > 0) {
        const found = await prisma.tenant.count({ where: { id: { in: existing.audienceIds } } });
        if (found !== existing.audienceIds.length) {
          return fail(reply, 409, 'STALE_AUDIENCE', 'بعض المراكز المستهدفة لم تعد موجودة. راجع المستهدفين قبل الإرسال.', 'Some targeted centers no longer exist. Review the audience before sending.');
        }
      }

      const notification = await prisma.$transaction(async (tx) => {
        const updated = await tx.platformNotification.update({
          where: { id: request.params.id },
          data: { status: 'ACTIVE', sentAt: new Date() },
        });

        await recordSuperAdminAudit(
          {
            actorId: request.user.sub,
            action: 'PLATFORM_NOTIFICATION_SENT',
            entityType: 'PlatformNotification',
            entityId: updated.id,
            beforeJson: { status: existing.status, sentAt: existing.sentAt },
            afterJson: { status: updated.status, sentAt: updated.sentAt },
            ip: request.ip ?? null,
          },
          tx,
        );

        return updated;
      });

      return reply.send({ success: true, data: notification });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/notifications/:id/archive',
    { preHandler: SUPER_ADMIN_GATE },
    async (request, reply) => {
      const existing = await prisma.platformNotification.findUnique({ where: { id: request.params.id } });
      if (!existing) return fail(reply, 404, 'NOTIFICATION_NOT_FOUND', 'الإشعار غير موجود.', 'Notification not found.');

      const notification = await prisma.$transaction(async (tx) => {
        const updated = await tx.platformNotification.update({
          where: { id: request.params.id },
          data: { status: 'ARCHIVED' },
        });

        await recordSuperAdminAudit(
          {
            actorId: request.user.sub,
            action: 'PLATFORM_NOTIFICATION_ARCHIVED',
            entityType: 'PlatformNotification',
            entityId: updated.id,
            beforeJson: { status: existing.status },
            afterJson: { status: updated.status },
            ip: request.ip ?? null,
          },
          tx,
        );

        return updated;
      });

      return reply.send({ success: true, data: notification });
    },
  );

  // ═══ FEATURE FLAGS ══════════════════════════════════════════════════════

  app.get('/feature-flags', { preHandler: SUPER_ADMIN_GATE }, async (_request, reply) => {
    const rows = await prisma.systemSetting.findMany({
      where: { key: { startsWith: FLAG_SETTING_PREFIX } },
    });
    const byKey = new Map(rows.map((row) => [row.key.slice(FLAG_SETTING_PREFIX.length), row]));

    const flags = FEATURE_FLAG_CATALOG.map((flag) => {
      const row = byKey.get(flag.key);
      return {
        ...flag,
        value: readFlagValue(row?.value),
        updatedAt: row?.updatedAt ?? null,
        updatedBy: row?.updatedById
          ? { id: row.updatedById }
          : null,
      };
    });

    return reply.send({ success: true, data: { flags } });
  });

  app.put<{ Params: { key: string }; Body: { enabled?: boolean; plans?: Record<string, boolean>; centers?: Record<string, boolean> } }>(
    '/feature-flags/:key',
    {
      preHandler: SUPER_ADMIN_GATE,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          properties: {
            enabled: { type: 'boolean' },
            plans: { type: 'object', additionalProperties: { type: 'boolean' } },
            centers: { type: 'object', additionalProperties: { type: 'boolean' } },
          },
        },
      },
    },
    async (request, reply) => {
      const { key } = request.params;
      if (!FEATURE_FLAG_KEYS.has(key)) {
        return fail(reply, 404, 'UNKNOWN_FEATURE_FLAG', 'هذا المفتاح غير معروف.', 'Unknown feature flag key.');
      }

      const settingKey = `${FLAG_SETTING_PREFIX}${key}`;
      const current = readFlagValue((await prisma.systemSetting.findUnique({ where: { key: settingKey } }))?.value);
      const next: FeatureFlagValue = {
        enabled: request.body.enabled ?? current.enabled,
        plans: request.body.plans ?? current.plans,
        centers: request.body.centers ?? current.centers,
      };

      if (Object.keys(next.centers).length > 0) {
        const found = await prisma.tenant.count({ where: { id: { in: Object.keys(next.centers) } } });
        if (found !== Object.keys(next.centers).length) {
          return fail(reply, 400, 'UNKNOWN_CENTER', 'بعض المراكز المحددة للتمكين غير موجودة.', 'One or more selected centers do not exist.');
        }
      }

      const row = await prisma.$transaction(async (tx) => {
        const upserted = await tx.systemSetting.upsert({
          where: { key: settingKey },
          create: { key: settingKey, value: next as Prisma.InputJsonValue, updatedById: request.user.sub },
          update: { value: next as Prisma.InputJsonValue, updatedById: request.user.sub },
        });

        await recordSuperAdminAudit(
          {
            actorId: request.user.sub,
            action: 'FEATURE_FLAG_UPDATED',
            entityType: 'SystemSetting',
            entityId: upserted.id,
            beforeJson: current as Prisma.InputJsonValue,
            afterJson: next as Prisma.InputJsonValue,
            ip: request.ip ?? null,
          },
          tx,
        );

        return upserted;
      });

      return reply.send({ success: true, data: { key, value: next, updatedAt: row.updatedAt } });
    },
  );

  app.delete<{ Params: { key: string } }>(
    '/feature-flags/:key',
    { preHandler: SUPER_ADMIN_GATE },
    async (request, reply) => {
      const { key } = request.params;
      if (!FEATURE_FLAG_KEYS.has(key)) {
        return fail(reply, 404, 'UNKNOWN_FEATURE_FLAG', 'هذا المفتاح غير معروف.', 'Unknown feature flag key.');
      }

      const settingKey = `${FLAG_SETTING_PREFIX}${key}`;
      const before = readFlagValue((await prisma.systemSetting.findUnique({ where: { key: settingKey } }))?.value);

      await prisma.$transaction(async (tx) => {
        await tx.systemSetting.deleteMany({ where: { key: settingKey } });

        await recordSuperAdminAudit(
          {
            actorId: request.user.sub,
            action: 'FEATURE_FLAG_RESET',
            entityType: 'SystemSetting',
            entityId: settingKey,
            beforeJson: before as Prisma.InputJsonValue,
            afterJson: DEFAULT_FLAG_VALUE as Prisma.InputJsonValue,
            ip: request.ip ?? null,
          },
          tx,
        );
      });

      return reply.send({ success: true, data: { key, value: DEFAULT_FLAG_VALUE } });
    },
  );

  // ═══ SYSTEM HEALTH ══════════════════════════════════════════════════════

  app.get('/system-health/checks', { preHandler: SUPER_ADMIN_GATE }, async (request, reply) => {
    const checks = await runHealthChecks(request);
    const unresolvedCritical = await prisma.systemHealthEvent.count({
      where: { level: 'CRITICAL', resolvedAt: null },
    });
    return reply.send({
      success: true,
      data: {
        checks,
        summary: {
          total: checks.length,
          ok: checks.filter((c) => c.ok).length,
          failed: checks.filter((c) => !c.ok).length,
          critical: checks.filter((c) => c.level === 'CRITICAL').length,
          unresolvedCriticalEvents: unresolvedCritical,
        },
        checkedAt: new Date().toISOString(),
      },
    });
  });

  app.post('/system-health/checks', { preHandler: SUPER_ADMIN_GATE }, async (request, reply) => {
    const checks = await runHealthChecks(request);
    const failed = checks.filter((check) => !check.ok);

    const recorded = await prisma.$transaction(async (tx) => {
      const events = [];
      for (const check of failed) {
        events.push(
          await tx.systemHealthEvent.create({
            data: {
              level: check.level === 'CRITICAL' ? 'CRITICAL' : healthLevelForFailure(check.key),
              category: `health.${check.key}`,
              message: `${healthCheckLabelAr[check.key] ?? check.key}: ${check.detailAr}`,
              meta: { value: check.value ?? null, latencyMs: check.latencyMs ?? null },
            },
          }),
        );
      }

      if (failed.length > 0) {
        await recordSuperAdminAudit(
          {
            actorId: request.user.sub,
            action: 'SYSTEM_HEALTH_CHECK_FAILED',
            entityType: 'SystemHealthEvent',
            entityId: events[0]?.id ?? null,
            afterJson: { failedChecks: failed.map((c) => c.key) },
            ip: request.ip ?? null,
          },
          tx,
        );
      }

      return events;
    });

    return reply.send({
      success: true,
      data: { checks, recordedEvents: recorded.length, checkedAt: new Date().toISOString() },
    });
  });

  app.get<{ Querystring: { level?: string; limit?: string } }>(
    '/system-health/events',
    { preHandler: SUPER_ADMIN_GATE },
    async (request, reply) => {
      const limit = toInt(request.query.limit, 100, 1, 500);
      const level = ['INFO', 'WARNING', 'CRITICAL'].includes(request.query.level ?? '')
        ? (request.query.level as Prisma.SystemHealthEventWhereInput['level'])
        : undefined;

      const [events, total, unresolved] = await Promise.all([
        prisma.systemHealthEvent.findMany({
          where: level ? { level } : {},
          orderBy: { createdAt: 'desc' },
          take: limit,
          include: { tenant: { select: { id: true, name: true } } },
        }),
        prisma.systemHealthEvent.count(),
        prisma.systemHealthEvent.count({ where: { resolvedAt: null } }),
      ]);

      return reply.send({ success: true, data: { events, pagination: { total, unresolved } } });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/system-health/events/:id/resolve',
    { preHandler: SUPER_ADMIN_GATE },
    async (request, reply) => {
      const existing = await prisma.systemHealthEvent.findUnique({ where: { id: request.params.id } });
      if (!existing) return fail(reply, 404, 'HEALTH_EVENT_NOT_FOUND', 'الحدث غير موجود.', 'Health event not found.');

      const event = await prisma.$transaction(async (tx) => {
        const updated = await tx.systemHealthEvent.update({
          where: { id: request.params.id },
          data: { resolvedAt: new Date() },
        });

        await recordSuperAdminAudit(
          {
            actorId: request.user.sub,
            action: 'SYSTEM_HEALTH_EVENT_RESOLVED',
            entityType: 'SystemHealthEvent',
            entityId: updated.id,
            beforeJson: { resolvedAt: existing.resolvedAt },
            afterJson: { resolvedAt: updated.resolvedAt },
            ip: request.ip ?? null,
          },
          tx,
        );

        return updated;
      });

      return reply.send({ success: true, data: event });
    },
  );

  // ═══ PLATFORM SETTINGS ═══════════════════════════════════════════════════

  app.get('/settings', { preHandler: SUPER_ADMIN_GATE }, async (_request, reply) => {
    const rows = await prisma.systemSetting.findMany({
      where: { key: { in: SETTING_KEYS } },
      include: { updatedBy: { select: { id: true, fullName: true, username: true } } },
    });
    const byKey = new Map(rows.map((row) => [row.key, row]));

    return reply.send({
      success: true,
      data: {
        settings: SETTING_KEYS.map((key) => {
          const row = byKey.get(key);
          return {
            key,
            kind: SETTINGS_CATALOG[key].kind,
            value: row?.value ?? SETTINGS_CATALOG[key].default,
            isDefault: !row,
            updatedAt: row?.updatedAt ?? null,
            updatedBy: row?.updatedBy ?? null,
          };
        }),
      },
    });
  });

  app.put<{ Body: { settings: Record<string, unknown> } }>(
    '/settings',
    {
      preHandler: SUPER_ADMIN_GATE,
      schema: {
        body: {
          type: 'object',
          required: ['settings'],
          additionalProperties: false,
          properties: {
            settings: { type: 'object', minProperties: 1, maxProperties: 50 },
          },
        },
      },
    },
    async (request, reply) => {
      const incoming = request.body.settings;

      for (const [key, value] of Object.entries(incoming)) {
        const error = validateSettingValue(key, value);
        if (error) return fail(reply, 400, 'INVALID_SETTING_VALUE', error, `Invalid value for setting "${key}".`);
      }

      const before: Record<string, Prisma.InputJsonValue> = {};
      for (const key of Object.keys(incoming)) {
        const row = await prisma.systemSetting.findUnique({ where: { key } });
        before[key] = (row?.value ?? SETTINGS_CATALOG[key].default) as Prisma.InputJsonValue;
      }

      const after: Record<string, Prisma.InputJsonValue> = {};
      for (const [key, value] of Object.entries(incoming)) after[key] = value as Prisma.InputJsonValue;

      const updatedCount = await prisma.$transaction(async (tx) => {
        const rows = [];
        for (const [key, value] of Object.entries(incoming)) {
          rows.push(
            await tx.systemSetting.upsert({
              where: { key },
              create: { key, value: value as Prisma.InputJsonValue, updatedById: request.user.sub },
              update: { value: value as Prisma.InputJsonValue, updatedById: request.user.sub },
            }),
          );
        }

        await recordSuperAdminAudit(
          {
            actorId: request.user.sub,
            action: 'PLATFORM_SETTINGS_UPDATED',
            entityType: 'SystemSetting',
            entityId: rows[0]?.id ?? null,
            beforeJson: before,
            afterJson: after,
            ip: request.ip ?? null,
          },
          tx,
        );

        return rows.length;
      });

      return reply.send({ success: true, data: { updated: updatedCount } });
    },
  );

  // ═══ SUPER-ADMIN AUDIT LOG ══════════════════════════════════════════════

  app.get<{
    Querystring: {
      page?: string; limit?: string; action?: string; actorId?: string; tenantId?: string; from?: string; to?: string;
    };
  }>(
    '/super-audit',
    { preHandler: SUPER_ADMIN_GATE },
    async (request, reply) => {
      const page = toInt(request.query.page, 1, 1, 100000);
      const limit = toInt(request.query.limit, 50, 1, 200);
      const skip = (page - 1) * limit;

      const where: Prisma.SuperAdminAuditLogWhereInput = {};
      if (request.query.action) where.action = { contains: request.query.action };
      if (request.query.actorId) where.actorId = request.query.actorId;
      if (request.query.tenantId) where.tenantId = request.query.tenantId;
      if (request.query.from || request.query.to) {
        where.createdAt = {};
        if (request.query.from && !Number.isNaN(Date.parse(request.query.from))) {
          where.createdAt.gte = new Date(request.query.from);
        }
        if (request.query.to && !Number.isNaN(Date.parse(request.query.to))) {
          where.createdAt.lte = new Date(request.query.to);
        }
        if (!where.createdAt.gte && !where.createdAt.lte) delete where.createdAt;
      }

      const [logs, total, actions] = await Promise.all([
        prisma.superAdminAuditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
          include: {
            actor: { select: { id: true, fullName: true, username: true, role: true } },
            tenant: { select: { id: true, name: true, slug: true } },
          },
        }),
        prisma.superAdminAuditLog.count({ where }),
        prisma.superAdminAuditLog.groupBy({ by: ['action'], _count: { action: true } }),
      ]);

      return reply.send({
        success: true,
        data: {
          logs,
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
          actionBreakdown: actions
            .map((row) => ({ action: row.action, count: row._count.action }))
            .sort((a, b) => b.count - a.count),
        },
      });
    },
  );

  // ═══ DATA & BACKUP ══════════════════════════════════════════════════════

  app.get('/data/status', { preHandler: SUPER_ADMIN_GATE }, async (_request, reply) => {
    const [counts, migrations, sizeBytes, recentExports] = await Promise.all([
      countRows(),
      migrationState().catch(() => null),
      databaseSizeBytes(),
      prisma.superAdminAuditLog.findMany({
        where: { action: { startsWith: 'DATA_EXPORT' } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, action: true, createdAt: true, entityType: true, entityId: true, ip: true },
      }),
    ]);

    return reply.send({
      success: true,
      data: {
        counts,
        migrations,
        databaseSizeBytes: sizeBytes,
        automatedBackup: null,
        automatedBackupNote: 'لا يوجد نظام نسخ احتياطي آلي مُهيّأ في البنية الحالية. النسخ الاحتياطي يُنفَّذ على مستوى مزوّد قاعدة البيانات (Supabase).',
        recentExports,
      },
    });
  });

  app.get<{ Querystring: { format?: string; tenantId?: string } }>(
    '/data/export/tenants',
    { preHandler: SUPER_ADMIN_GATE },
    async (request, reply) => {
      const format = request.query.format === 'csv' ? 'csv' : 'json';
      const tenants = await prisma.tenant.findMany({
        where: request.query.tenantId ? { id: request.query.tenantId } : {},
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { users: true, students: true, teachers: true, sessions: true } },
          subscriptions: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });

      const rows = tenants.map((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        ownerName: tenant.ownerName,
        ownerPhone: tenant.ownerPhone,
        plan: tenant.plan,
        isActive: tenant.isActive,
        trialEndsAt: tenant.trialEndsAt,
        maxDesks: tenant.maxDesks,
        maxBranches: tenant.maxBranches,
        maxUsers: tenant.maxUsers,
        visitLimit: tenant.visitLimit,
        users: tenant._count.users,
        students: tenant._count.students,
        teachers: tenant._count.teachers,
        sessions: tenant._count.sessions,
        subscriptionStatus: tenant.subscriptions[0]?.status ?? null,
        subscriptionAmount: tenant.subscriptions[0]?.amount.toString() ?? null,
        periodEnd: tenant.subscriptions[0]?.periodEnd ?? null,
        createdAt: tenant.createdAt,
      }));

      await recordSuperAdminAudit({
        actorId: request.user.sub,
        action: 'DATA_EXPORT_TENANTS',
        entityType: 'Tenant',
        entityId: request.query.tenantId ?? null,
        afterJson: { format, rowCount: rows.length },
        ip: request.ip ?? null,
      });

      if (format === 'csv') {
        const columns = Object.keys(rows[0] ?? { id: '' });
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', 'attachment; filename="madar-tenants.csv"');
        return reply.send(toCsv(rows as Record<string, unknown>[], columns));
      }

      return reply.send({ success: true, data: { rows } });
    },
  );

  app.get<{ Querystring: { format?: string; tenantId?: string } }>(
    '/data/export/users',
    { preHandler: SUPER_ADMIN_GATE },
    async (request, reply) => {
      const format = request.query.format === 'csv' ? 'csv' : 'json';
      const users = await prisma.user.findMany({
        where: request.query.tenantId ? { tenantId: request.query.tenantId } : {},
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, username: true, email: true, fullName: true, role: true,
          phoneNumber: true, isActive: true, createdAt: true,
          tenant: { select: { id: true, name: true, slug: true } },
        },
      });

      const rows = users.map((user) => ({
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        phoneNumber: user.phoneNumber,
        isActive: user.isActive,
        tenantName: user.tenant?.name ?? null,
        tenantSlug: user.tenant?.slug ?? null,
        createdAt: user.createdAt,
      }));

      await recordSuperAdminAudit({
        actorId: request.user.sub,
        action: 'DATA_EXPORT_USERS',
        entityType: 'User',
        entityId: null,
        tenantId: request.query.tenantId ?? null,
        afterJson: { format, rowCount: rows.length },
        ip: request.ip ?? null,
      });

      if (format === 'csv') {
        const columns = Object.keys(rows[0] ?? { id: '' });
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', 'attachment; filename="madar-users.csv"');
        return reply.send(toCsv(rows as Record<string, unknown>[], columns));
      }

      return reply.send({ success: true, data: { rows } });
    },
  );

  // ═══ SECURITY ═══════════════════════════════════════════════════════════

  app.get('/security/sessions', { preHandler: SUPER_ADMIN_GATE }, async (request, reply) => {
    const [sessions, openCount] = await Promise.all([
      prisma.superAdminSession.findMany({
        where: { adminUserId: request.user.sub },
        orderBy: { startedAt: 'desc' },
        take: 50,
        include: { impersonatingTenant: { select: { id: true, name: true, slug: true } } },
      }),
      prisma.superAdminSession.count({
        where: { adminUserId: request.user.sub, endedAt: null, expiresAt: { gt: new Date() } },
      }),
    ]);

    return reply.send({
      success: true,
      data: {
        sessions: sessions.map((session) => ({
          ...session,
          isActive: session.endedAt === null && session.expiresAt !== null && session.expiresAt > new Date(),
        })),
        openSessions: openCount,
      },
    });
  });

  app.post<{ Params: { id: string } }>(
    '/security/sessions/:id/revoke',
    { preHandler: SUPER_ADMIN_GATE },
    async (request, reply) => {
      const session = await prisma.superAdminSession.findUnique({ where: { id: request.params.id } });
      if (!session) return fail(reply, 404, 'SESSION_NOT_FOUND', 'الجلسة غير موجودة.', 'Session not found.');
      if (session.adminUserId !== request.user.sub) {
        return fail(reply, 403, 'SESSION_NOT_OWNED', 'لا يمكنك إلغاء جلسة لا تخصك.', 'You can only revoke your own sessions.');
      }
      if (session.endedAt) {
        return fail(reply, 409, 'SESSION_ALREADY_ENDED', 'انتهت هذه الجلسة مسبقًا.', 'This session has already ended.');
      }

      const revoked = await prisma.$transaction(async (tx) => {
        const updated = await tx.superAdminSession.update({
          where: { id: request.params.id },
          data: { endedAt: new Date() },
        });

        await recordSuperAdminAudit(
          {
            actorId: request.user.sub,
            tenantId: session.impersonatingTenantId,
            action: 'SUPER_ADMIN_SESSION_REVOKED',
            entityType: 'SuperAdminSession',
            entityId: updated.id,
            beforeJson: { endedAt: session.endedAt },
            afterJson: { endedAt: updated.endedAt },
            reason: 'revoked-by-owner',
            ip: request.ip ?? null,
          },
          tx,
        );

        return updated;
      });

      return reply.send({ success: true, data: revoked });
    },
  );

  app.get<{ Querystring: { limit?: string } }>(
    '/security/history',
    { preHandler: SUPER_ADMIN_GATE },
    async (request, reply) => {
      const limit = toInt(request.query.limit, 50, 1, 200);
      const securityActions = [
        'VIEW_AS_CENTER_STARTED', 'VIEW_AS_CENTER_RETURNED', 'SUPER_ADMIN_SESSION_REVOKED',
        'TENANT_SUSPENDED', 'TENANT_REACTIVATED', 'TENANT_TRIAL_EXTENDED',
        'PLATFORM_SETTINGS_UPDATED', 'FEATURE_FLAG_UPDATED', 'FEATURE_FLAG_RESET',
        'DATA_EXPORT_TENANTS', 'DATA_EXPORT_USERS',
      ];
      const logs = await prisma.superAdminAuditLog.findMany({
        where: { action: { in: securityActions } },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { tenant: { select: { id: true, name: true } } },
      });
      return reply.send({ success: true, data: { logs } });
    },
  );

  // ═══ SUPPORT NOTES ══════════════════════════════════════════════════════

  app.get<{ Querystring: { status?: string; tenantId?: string; limit?: string; offset?: string } }>(
    '/support-notes',
    { preHandler: SUPER_ADMIN_GATE },
    async (request, reply) => {
      const limit = toInt(request.query.limit, 50, 1, 200);
      const offset = toInt(request.query.offset, 0, 0, 100000);
      const status = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(request.query.status ?? '')
        ? (request.query.status as SupportNoteStatus)
        : undefined;

      const where: Prisma.SupportNoteWhereInput = {};
      if (status) where.status = status;
      if (request.query.tenantId) where.tenantId = request.query.tenantId;

      const [notes, total, openCount] = await Promise.all([
        prisma.supportNote.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: offset,
          include: {
            tenant: { select: { id: true, name: true, slug: true, plan: true } },
            author: { select: { id: true, fullName: true, username: true } },
          },
        }),
        prisma.supportNote.count({ where }),
        prisma.supportNote.count({ where: { status: 'OPEN' } }),
      ]);

      return reply.send({ success: true, data: { notes, pagination: { total, offset, limit, openCount } } });
    },
  );

  app.post<{ Body: { tenantId: string; text: string } }>(
    '/support-notes',
    {
      preHandler: SUPER_ADMIN_GATE,
      schema: {
        body: {
          type: 'object',
          required: ['tenantId', 'text'],
          additionalProperties: false,
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            text: { type: 'string', minLength: 2, maxLength: 4000 },
          },
        },
      },
    },
    async (request, reply) => {
      const { tenantId, text } = request.body;

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
      if (!tenant) return fail(reply, 404, 'CENTER_NOT_FOUND', 'المركز غير موجود.', 'Center not found.');

      const note = await prisma.$transaction(async (tx) => {
        const created = await tx.supportNote.create({
          data: { tenantId, authorId: request.user.sub, text: text.trim(), status: 'OPEN' },
          include: {
            tenant: { select: { id: true, name: true, slug: true, plan: true } },
            author: { select: { id: true, fullName: true, username: true } },
          },
        });

        await recordSuperAdminAudit(
          {
            actorId: request.user.sub,
            tenantId,
            action: 'SUPPORT_NOTE_CREATED',
            entityType: 'SupportNote',
            entityId: created.id,
            afterJson: { status: created.status },
            ip: request.ip ?? null,
          },
          tx,
        );

        return created;
      });

      return reply.code(201).send({ success: true, data: note });
    },
  );

  app.patch<{ Params: { id: string }; Body: { status?: string; text?: string } }>(
    '/support-notes/:id',
    {
      preHandler: SUPER_ADMIN_GATE,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: {
            status: { type: 'string', enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] },
            text: { type: 'string', minLength: 2, maxLength: 4000 },
          },
        },
      },
    },
    async (request, reply) => {
      const existing = await prisma.supportNote.findUnique({ where: { id: request.params.id } });
      if (!existing) return fail(reply, 404, 'SUPPORT_NOTE_NOT_FOUND', 'الملاحظة غير موجودة.', 'Support note not found.');

      const nextStatus = (request.body.status ?? existing.status) as SupportNoteStatus;
      const nextText = request.body.text === undefined ? existing.text : request.body.text.trim();

      const note = await prisma.$transaction(async (tx) => {
        const updated = await tx.supportNote.update({
          where: { id: request.params.id },
          data: { status: nextStatus, text: nextText },
          include: {
            tenant: { select: { id: true, name: true, slug: true, plan: true } },
            author: { select: { id: true, fullName: true, username: true } },
          },
        });

        await recordSuperAdminAudit(
          {
            actorId: request.user.sub,
            tenantId: existing.tenantId,
            action: 'SUPPORT_NOTE_UPDATED',
            entityType: 'SupportNote',
            entityId: updated.id,
            beforeJson: { status: existing.status, text: existing.text },
            afterJson: { status: updated.status, text: updated.text },
            ip: request.ip ?? null,
          },
          tx,
        );

        return updated;
      });

      return reply.send({ success: true, data: note });
    },
  );

  // ═══ USAGE OVERRIDES ════════════════════════════════════════════════════

  app.get<{ Querystring: { tenantId?: string; activeOnly?: string; limit?: string } }>(
    '/usage-overrides',
    { preHandler: SUPER_ADMIN_GATE },
    async (request, reply) => {
      const limit = toInt(request.query.limit, 100, 1, 500);
      const now = new Date();
      const where: Prisma.UsageOverrideWhereInput = {};
      if (request.query.tenantId) where.tenantId = request.query.tenantId;
      if (request.query.activeOnly === 'true') {
        where.OR = [{ expiresAt: null }, { expiresAt: { gte: now } }];
      }

      const [overrides, activeCount] = await Promise.all([
        prisma.usageOverride.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          include: {
            tenant: { select: { id: true, name: true, slug: true, plan: true } },
            grantedBy: { select: { id: true, fullName: true, username: true } },
          },
        }),
        prisma.usageOverride.count({ where: { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] } }),
      ]);

      return reply.send({
        success: true,
        data: { overrides, metrics: USAGE_METRICS, pagination: { total: overrides.length, activeCount } },
      });
    },
  );

  app.post<{ Body: { tenantId: string; metric: string; extraAmount: number; reason?: string; expiresAt?: string } }>(
    '/usage-overrides',
    {
      preHandler: SUPER_ADMIN_GATE,
      schema: {
        body: {
          type: 'object',
          required: ['tenantId', 'metric', 'extraAmount'],
          additionalProperties: false,
          properties: {
            tenantId: { type: 'string', format: 'uuid' },
            metric: { type: 'string', enum: [...USAGE_METRICS] },
            extraAmount: { type: 'integer', minimum: 0, maximum: 1000000 },
            reason: { type: 'string', minLength: 2, maxLength: 500 },
            expiresAt: { type: 'string', minLength: 4, maxLength: 40 },
          },
        },
      },
    },
    async (request, reply) => {
      const { tenantId, metric, extraAmount, reason, expiresAt } = request.body;

      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
      if (!tenant) return fail(reply, 404, 'CENTER_NOT_FOUND', 'المركز غير موجود.', 'Center not found.');

      if (reason === undefined) {
        return fail(reply, 400, 'REASON_REQUIRED', 'سبب الاستثناء مطلوب للتدقيق.', 'A reason is required for the audit trail.');
      }

      const parsedExpiry = expiresAt === undefined ? null : new Date(expiresAt);
      if (parsedExpiry !== null && Number.isNaN(parsedExpiry.getTime())) {
        return fail(reply, 400, 'INVALID_EXPIRY', 'تاريخ الانتهاء غير صالح.', 'Invalid expiry date.');
      }

      const override = await prisma.$transaction(async (tx) => {
        const created = await tx.usageOverride.create({
          data: {
            tenantId,
            metric: metric.trim(),
            extraAmount,
            reason: reason.trim(),
            expiresAt: parsedExpiry,
            grantedById: request.user.sub,
          },
          include: {
            tenant: { select: { id: true, name: true, slug: true, plan: true } },
            grantedBy: { select: { id: true, fullName: true, username: true } },
          },
        });

        await recordSuperAdminAudit(
          {
            actorId: request.user.sub,
            tenantId,
            action: 'USAGE_OVERRIDE_GRANTED',
            entityType: 'UsageOverride',
            entityId: created.id,
            afterJson: { metric: created.metric, extraAmount: created.extraAmount, expiresAt: created.expiresAt },
            reason: reason.trim(),
            ip: request.ip ?? null,
          },
          tx,
        );

        return created;
      });

      return reply.code(201).send({ success: true, data: override });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/usage-overrides/:id',
    { preHandler: SUPER_ADMIN_GATE },
    async (request, reply) => {
      const existing = await prisma.usageOverride.findUnique({ where: { id: request.params.id } });
      if (!existing) return fail(reply, 404, 'USAGE_OVERRIDE_NOT_FOUND', 'استثناء الاستخدام غير موجود.', 'Usage override not found.');

      await prisma.$transaction(async (tx) => {
        await tx.usageOverride.delete({ where: { id: request.params.id } });

        await recordSuperAdminAudit(
          {
            actorId: request.user.sub,
            tenantId: existing.tenantId,
            action: 'USAGE_OVERRIDE_REVOKED',
            entityType: 'UsageOverride',
            entityId: existing.id,
            beforeJson: { metric: existing.metric, extraAmount: existing.extraAmount, expiresAt: existing.expiresAt },
            reason: 'revoked-by-owner',
            ip: request.ip ?? null,
          },
          tx,
        );
      });

      return reply.send({ success: true, data: { id: request.params.id } });
    },
  );

  // ═══ MY ACCOUNT ═════════════════════════════════════════════════════════

  app.get('/account', { preHandler: SUPER_ADMIN_GATE }, async (request, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: request.user.sub },
      select: {
        id: true, username: true, email: true, fullName: true, phoneNumber: true,
        role: true, preferredLanguage: true, isActive: true, createdAt: true, updatedAt: true,
        _count: { select: { superAdminAuditLogs: true, superAdminSessions: true } },
      },
    });
    if (!user) return fail(reply, 404, 'ACCOUNT_NOT_FOUND', 'الحساب غير موجود.', 'Account not found.');
    return reply.send({ success: true, data: { user } });
  });

  app.patch<{ Body: { fullName?: string; email?: string; phoneNumber?: string; preferredLanguage?: string } }>(
    '/account',
    {
      preHandler: SUPER_ADMIN_GATE,
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: {
            fullName: { type: 'string', minLength: 2, maxLength: 100 },
            email: { type: 'string', minLength: 3, maxLength: 200 },
            phoneNumber: { type: 'string', pattern: '^(010|011|012|015)[0-9]{8}$' },
            preferredLanguage: { type: 'string', enum: ['ar', 'en'] },
          },
        },
      },
    },
    async (request, reply) => {
      const { fullName, email, phoneNumber, preferredLanguage } = request.body;

      if (email) {
        const taken = await prisma.user.findFirst({ where: { email, id: { not: request.user.sub } }, select: { id: true } });
        if (taken) return fail(reply, 409, 'EMAIL_TAKEN', 'هذا البريد الإلكتروني مستخدم بالفعل.', 'This email is already in use.');
      }

      const before = await prisma.user.findUnique({
        where: { id: request.user.sub },
        select: { fullName: true, email: true, phoneNumber: true, preferredLanguage: true },
      });

      const user = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: request.user.sub },
          data: {
            ...(fullName === undefined ? {} : { fullName: fullName.trim() }),
            ...(email === undefined ? {} : { email: email.trim() }),
            ...(phoneNumber === undefined ? {} : { phoneNumber }),
            ...(preferredLanguage === undefined ? {} : { preferredLanguage }),
          },
          select: { id: true, username: true, email: true, fullName: true, phoneNumber: true, role: true, preferredLanguage: true, isActive: true, createdAt: true },
        });

        await recordSuperAdminAudit(
          {
            actorId: request.user.sub,
            action: 'SUPER_ADMIN_PROFILE_UPDATED',
            entityType: 'User',
            entityId: updated.id,
            beforeJson: before as unknown as Prisma.InputJsonValue,
            afterJson: { fullName: updated.fullName, email: updated.email, phoneNumber: updated.phoneNumber, preferredLanguage: updated.preferredLanguage },
            ip: request.ip ?? null,
          },
          tx,
        );

        return updated;
      });

      return reply.send({ success: true, data: { user } });
    },
  );

  app.patch<{ Body: { currentPassword: string; newPassword: string } }>(
    '/account/password',
    {
      preHandler: SUPER_ADMIN_GATE,
      schema: {
        body: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          additionalProperties: false,
          properties: {
            currentPassword: { type: 'string', minLength: 1, maxLength: 200 },
            newPassword: { type: 'string', minLength: 8, maxLength: 200 },
          },
        },
      },
    },
    async (request, reply) => {
      const account = await prisma.user.findUnique({
        where: { id: request.user.sub },
        select: { id: true, username: true, passwordHash: true },
      });
      if (!account) return fail(reply, 404, 'ACCOUNT_NOT_FOUND', 'الحساب غير موجود.', 'Account not found.');

      const currentMatches = await argon2.verify(account.passwordHash, request.body.currentPassword).catch(() => false);
      if (!currentMatches) {
        return fail(reply, 401, 'WRONG_CURRENT_PASSWORD', 'كلمة المرور الحالية غير صحيحة.', 'The current password is incorrect.');
      }
      if (await argon2.verify(account.passwordHash, request.body.newPassword).catch(() => false)) {
        return fail(reply, 409, 'PASSWORD_UNCHANGED', 'كلمة المرور الجديدة مطابقة للحالية.', 'The new password matches the current one.');
      }

      const passwordHash = await argon2.hash(request.body.newPassword, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      await prisma.$transaction(async (tx) => {
        await tx.user.update({ where: { id: account.id }, data: { passwordHash } });
        await recordSuperAdminAudit(
          {
            actorId: request.user.sub,
            action: 'SUPER_ADMIN_PASSWORD_CHANGED',
            entityType: 'User',
            entityId: account.id,
            // Never the password itself — only that it was changed.
            afterJson: { username: account.username, changedAt: new Date().toISOString() },
            ip: request.ip ?? null,
          },
          tx,
        );
      });

      return reply.send({
        success: true,
        data: {
          changed: true,
          noticeAr: 'تم تغيير كلمة المرور. استخدمها في تسجيل الدخول القادم.',
          noticeEn: 'Your password was changed. Use it the next time you sign in.',
        },
      });
    },
  );
};

export default platformOpsRoutes;
