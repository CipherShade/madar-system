import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

// This suite verifies the platform-ops audit guarantee against a real database:
// every platform mutation must be committed together with its audit row, so a
// failure to record the audit can never leave an un-audited write behind.
//
// Destructive, like its siblings: `before` creates a super-admin user and
// `after` deletes it, a probe notification, a probe setting and that user's
// audit rows. Skipped unless TEST_DATABASE_URL points at a disposable test
// database whose name says so, and refused outright if it is the
// application's own database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

function assertDisposableDatabase(url: string): void {
  const databaseName = (u: string): string => {
    try {
      return decodeURIComponent(new URL(u).pathname.replace(/^\//, ''));
    } catch {
      return '';
    }
  };
  const name = databaseName(url);
  if (!name) throw new Error('TEST_DATABASE_URL is not a parseable database URL.');
  if (!/test/i.test(name)) {
    throw new Error(
      `Refusing to run destructive integration tests against database "${name}": the name does not contain "test". ` +
        'Point TEST_DATABASE_URL at a disposable database.',
    );
  }
  const live = process.env.DATABASE_URL;
  if (live && databaseName(live) === name) {
    throw new Error(`Refusing to run: TEST_DATABASE_URL and DATABASE_URL both point at database "${name}".`);
  }
}
if (TEST_DATABASE_URL) assertDisposableDatabase(TEST_DATABASE_URL);

type FastifyLike = {
  ready(): Promise<void>;
  close(): Promise<void>;
  log: { level: string };
  jwt: { sign(payload: Record<string, unknown>, opts?: { expiresIn?: string }): string };
  inject(opts: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    payload?: unknown;
  }): Promise<{ statusCode: number; body: string }>;
};

type PrismaLike = {
  user: {
    create(args: unknown): Promise<{ id: string; username: string }>;
    deleteMany(args: unknown): Promise<unknown>;
  };
  systemSetting: {
    findUnique(args: unknown): Promise<{ key: string; value: unknown } | null>;
    deleteMany(args: unknown): Promise<unknown>;
  };
  platformNotification: {
    findMany(args: unknown): Promise<{ id: string }[]>;
    deleteMany(args: unknown): Promise<unknown>;
  };
  superAdminAuditLog: {
    findMany(args: unknown): Promise<{ id: string; action: string; entityId: string | null }[]>;
    deleteMany(args: unknown): Promise<unknown>;
  };
};

const authHeaders = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

function json(body: string): any {
  return JSON.parse(body);
}

const SUPER_ADMIN_USERNAME = 'int_platform_owner';
const GHOST_ACTOR_ID = '00000000-0000-4000-8000-00000000dead';
const PROBE_SETTING_KEY = 'platform.contactEmail';

describe(
  'DB-backed platform-ops audit atomicity',
  { skip: !TEST_DATABASE_URL },
  () => {
    let app: FastifyLike;
    let prisma: PrismaLike;
    let superAdminId: string;
    let superAdminToken: string;

    before(async () => {
      // This suite uses the application's own shared Prisma client rather than a
      // local one, so it must be pointed at the test database *before* the app
      // modules are imported. Without this it would create and delete a
      // super-admin user in whatever DATABASE_URL happens to point at.
      process.env.DATABASE_URL = TEST_DATABASE_URL as string;
      const { buildApp } = await import('../../../src/server/app.js');
      const { prisma: realPrisma } = await import('../../../src/server/lib/prisma.js');
      app = buildApp() as unknown as FastifyLike;
      await app.ready();
      app.log.level = 'silent';
      prisma = realPrisma as unknown as PrismaLike;

      const argon2 = await import('argon2');
      const created = await prisma.user.create({
        data: {
          username: SUPER_ADMIN_USERNAME,
          fullName: 'مالك المنصة',
          passwordHash: await argon2.hash('PlatformOwner@123'),
          role: 'SUPER_ADMIN',
          phoneNumber: '01000000009',
          preferredLanguage: 'ar',
          isActive: true,
        },
      });
      superAdminId = created.id;
      superAdminToken = app.jwt.sign(
        { sub: superAdminId, username: SUPER_ADMIN_USERNAME, role: 'SUPER_ADMIN' },
        { expiresIn: '1h' },
      );
    });

    after(async () => {
      await prisma.superAdminAuditLog.deleteMany({ where: { actorId: superAdminId } });
      await prisma.platformNotification.deleteMany({ where: { titleAr: 'إشعار اختبار الذرّية' } });
      await prisma.systemSetting.deleteMany({ where: { key: PROBE_SETTING_KEY } });
      await prisma.user.deleteMany({ where: { username: SUPER_ADMIN_USERNAME } });
      await app.close();
    });

    test('a successful platform mutation writes its audit row in the same commit', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/notifications',
        headers: authHeaders(superAdminToken),
        payload: {
          titleAr: 'إشعار اختبار الذرّية',
          bodyAr: 'هذا الإشعار جزء من اختبار تسلسل العمليات.',
          audience: 'ALL_CENTERS',
          publishNow: true,
        },
      });
      assert.equal(res.statusCode, 201, res.body);
      const notificationId = json(res.body).data.id;

      const audits = await prisma.superAdminAuditLog.findMany({
        where: { actorId: superAdminId, action: 'PLATFORM_NOTIFICATION_CREATED', entityId: notificationId },
      });
      assert.equal(audits.length, 1, 'exactly one audit row must accompany the mutation');
    });

    test('a mutation whose audit cannot be written leaves NO persisted side effect', async () => {
      // The token is correctly signed and carries SUPER_ADMIN, so the guard
      // passes, but the actor row does not exist. The audit insert therefore
      // violates the actor foreign key. Because the mutation and its audit share
      // one transaction, the mutation must roll back with it.
      const ghostToken = app.jwt.sign(
        { sub: GHOST_ACTOR_ID, username: 'ghost-owner', role: 'SUPER_ADMIN' },
        { expiresIn: '1h' },
      );

      const res = await app.inject({
        method: 'PUT',
        url: '/api/admin/settings',
        headers: authHeaders(ghostToken),
        payload: { settings: { [PROBE_SETTING_KEY]: 'rollback-probe@example.com' } },
      });
      assert.notEqual(res.statusCode, 200, 'the request must not report success');

      const persisted = await prisma.systemSetting.findUnique({ where: { key: PROBE_SETTING_KEY } });
      assert.equal(persisted, null, 'the setting must be rolled back when its audit cannot be recorded');
    });

    test('a rejected mutation leaves neither a write nor an audit row', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/admin/notifications',
        headers: authHeaders(superAdminToken),
        payload: {
          titleAr: 'إشعار مرفوض',
          bodyAr: 'يجب ألا يُنشأ.',
          audience: 'CENTER',
          audienceIds: ['00000000-0000-4000-8000-00000000beef'],
        },
      });
      assert.equal(res.statusCode, 400, res.body);
      assert.equal(json(res.body).error.code, 'UNKNOWN_CENTER');

      const stray = await prisma.platformNotification.findMany({ where: { titleAr: 'إشعار مرفوض' } });
      assert.equal(stray.length, 0, 'a rejected mutation must not create a notification');
    });
  },
);
