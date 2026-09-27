import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

// This suite exercises the real PostgreSQL database. It is skipped unless
// TEST_DATABASE_URL points at a disposable test database.
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

function assertDisposableDatabase(url: string): void {
  const name = (u: string): string => {
    try {
      return decodeURIComponent(new URL(u).pathname.replace(/^\//, ''));
    } catch {
      return '';
    }
  };
  const db = name(url);
  if (!db) throw new Error('TEST_DATABASE_URL is not a parseable database URL.');
  if (!/test/i.test(db)) {
    throw new Error(`Refusing to run destructive tests against database "${db}": the name does not contain "test".`);
  }
  const live = process.env.DATABASE_URL;
  if (live && name(live) === db) {
    throw new Error(`Refusing to run: TEST_DATABASE_URL and DATABASE_URL both point at database "${db}".`);
  }
}
if (TEST_DATABASE_URL) assertDisposableDatabase(TEST_DATABASE_URL);

/**
 * The demo seeder creates a `main-center` tenant with two hardcoded-password
 * users, and it used to run on every boot in every environment, upserting those
 * users by username and overwriting `passwordHash` and `tenantId`.
 *
 * These tests pin the behaviour that matters for a real client: the seeder must
 * never touch an account it does not own, and it must never reset a password
 * that already exists.
 */
describe(
  'DB-backed demo seed safety',
  { skip: !TEST_DATABASE_URL },
  () => {
    let prisma: any;
    let seedDemoData: (client: any) => Promise<void>;
    let hashPwd: (plain: string) => Promise<string>;
    let verifyPwd: (hash: string, plain: string) => Promise<boolean>;

    const DEMO_PASSWORD = 'Admin@12345!';

    async function clean(): Promise<void> {
      await prisma.auditLog.deleteMany({});
      await prisma.expense.deleteMany({});
      await prisma.sessionSettlement.deleteMany({});
      await prisma.sessionReconciliation.deleteMany({});
      await prisma.attendance.deleteMany({});
      await prisma.shiftRegister.deleteMany({});
      await prisma.session.deleteMany({});
      await prisma.student.deleteMany({});
      await prisma.teacher.deleteMany({});
      await prisma.room.deleteMany({});
      await prisma.subscription.deleteMany({});
      await prisma.user.deleteMany({});
      await prisma.tenant.deleteMany({});
    }

    before(async () => {
      process.env.DATABASE_URL = TEST_DATABASE_URL as string;
      // Pin the demo password so the test never depends on a developer machine's env.
      process.env.SEED_ADMIN_PASSWORD = DEMO_PASSWORD;
      const { PrismaClient } = await import('@prisma/client');
      prisma = new PrismaClient();
      const seed = await import('../../../src/server/lib/demoSeed.js');
      seedDemoData = seed.seedDemoData;
      const argon2 = await import('argon2');
      hashPwd = (p: string) => argon2.hash(p);
      verifyPwd = (h: string, p: string) => argon2.verify(h, p);
      await clean();
    });

    after(async () => {
      await clean();
      await prisma.$disconnect();
    });

    test('a real center keeps its admin account when the demo seed runs', async () => {
      // A paying client that picked the very common username "admin".
      const realTenant = await prisma.tenant.create({
        data: { name: 'مركز عميل حقيقي', slug: `real-client-${Date.now()}`, isActive: true },
      });
      const clientPassword = 'TheClientsOwnPassword@9';
      const clientAdmin = await prisma.user.create({
        data: {
          tenantId: realTenant.id,
          username: 'admin',
          email: 'owner@realcenter.example',
          passwordHash: await hashPwd(clientPassword),
          fullName: 'مالك المركز الحقيقي',
          role: 'ADMIN',
          phoneNumber: '01099998888',
          preferredLanguage: 'ar',
          isActive: true,
        },
      });

      // The seeder must refuse rather than adopt someone else's account.
      await assert.rejects(() => seedDemoData(prisma), /already registered to another center/);

      // The important part: nothing about the client was altered.
      const after_ = await prisma.user.findUnique({ where: { id: clientAdmin.id } });
      assert.equal(after_.tenantId, realTenant.id, "the client's account was moved to another center");
      assert.equal(after_.email, 'owner@realcenter.example', "the client's account was rewritten");
      assert.ok(
        await verifyPwd(after_.passwordHash, clientPassword),
        "the client's password was reset to the public demo default",
      );
      assert.ok(!(await verifyPwd(after_.passwordHash, DEMO_PASSWORD)));

      await prisma.tenant.delete({ where: { id: realTenant.id } });
    });

    test('the demo seed creates its users when the names are free', async () => {
      await seedDemoData(prisma);

      const demoTenant = await prisma.tenant.findUnique({ where: { slug: 'main-center' } });
      assert.ok(demoTenant, 'the demo tenant should be created in development');

      const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
      assert.equal(admin.tenantId, demoTenant.id);
      assert.ok(await verifyPwd(admin.passwordHash, DEMO_PASSWORD), 'demo admin should use the demo password');
    });

    test('re-running the seed never resets a changed password', async () => {
      const changed = 'AChangedDemoPassword@42';
      const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
      await prisma.user.update({ where: { id: admin.id }, data: { passwordHash: await hashPwd(changed) } });

      // Boot again.
      await seedDemoData(prisma);

      const after_ = await prisma.user.findUnique({ where: { id: admin.id } });
      assert.ok(
        await verifyPwd(after_.passwordHash, changed),
        'the seed overwrote a password that a human had already changed',
      );
    });
  },
);
