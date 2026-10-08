import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Tenant ownership at its two weakest points, against a real PostgreSQL database.
 *
 * `rooms.branch_id` is the only relationship in the scheduling graph whose two ends
 * can belong to different centers, and nothing in the database could stop it: a
 * branch from another center is a perfectly valid row, so the foreign key is
 * satisfied. Left unvalidated it did two things at once — it filed another
 * center's branch as one of this center's own, and it billed the branch that the
 * session's room sits in, because `recordVisitUsage` reads exactly that column. So
 * the room routes now resolve `branchId` against the caller's tenant.
 *
 * The second half is the column itself. `tenant_id` was nullable on the core
 * tables, so an unowned row was representable: it would belong to no center, so no
 * report would include it and no per-tenant index would find it. The last test
 * asserts the database refuses to store one, which is what stops the mistake from
 * coming back through any future write path.
 *
 * Destructive, like its siblings: `clean()` empties every business table. Skipped
 * unless TEST_DATABASE_URL points at a disposable test database whose name says
 * so, and refused outright if it is the application's own database.
 */
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

const authHeaders = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

function json(body: string): any {
  return JSON.parse(body);
}

function errorCode(body: string): string | undefined {
  return json(body)?.error?.code;
}

describe('DB-backed tenant ownership: a room cannot join another center\'s branch', { skip: !TEST_DATABASE_URL }, () => {
  let app: FastifyLike;
  let prisma: any;

  let adminB: string;
  let tenantAId: string;
  let tenantBId: string;
  let branchAId: string;
  let branchBId: string;

  const token = (sub: string, username: string, role: string, tenantId: string) =>
    app.jwt.sign({ sub, username, role, tenantId }, { expiresIn: '1h' });

  async function seed(): Promise<void> {
    const argon2 = await import('argon2');

    const tenantA = await prisma.tenant.create({
      data: { name: 'مركز أ', slug: `rb-a-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, isActive: true },
    });
    const tenantB = await prisma.tenant.create({
      data: { name: 'مركز ب', slug: `rb-b-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, isActive: true },
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    // Both centers are paid. Without a subscription the lifecycle guard answers
    // 403 first and the suite would go green for the wrong reason: it would be
    // testing the gate rather than the ownership check.
    for (const tenant of [tenantA, tenantB]) {
      await prisma.subscription.create({
        data: {
          tenantId: tenant.id,
          amount: 1199,
          status: 'ACTIVE',
          periodStart: new Date(Date.now() - 5 * 86_400_000),
          periodEnd: new Date(Date.now() + 25 * 86_400_000),
        },
      });
    }

    const adminBRow = await prisma.user.create({
      data: {
        tenantId: tenantB.id,
        username: 'rb_admin_b',
        fullName: 'مدير ب',
        passwordHash: await argon2.hash('RbDesk@123'),
        role: 'ADMIN',
        phoneNumber: '01000000031',
        preferredLanguage: 'ar',
        isActive: true,
      },
    });
    adminB = token(adminBRow.id, 'rb_admin_b', 'ADMIN', tenantB.id);

    branchAId = (await prisma.branch.create({ data: { tenantId: tenantA.id, name: 'فرع أ', isActive: true } })).id;
    branchBId = (await prisma.branch.create({ data: { tenantId: tenantB.id, name: 'فرع ب', isActive: true } })).id;
  }

  async function clean(): Promise<void> {
    await prisma.auditLog.deleteMany({});
    await prisma.stockMovement.deleteMany({});
    await prisma.bookSaleLine.deleteMany({});
    await prisma.bookSale.deleteMany({});
    await prisma.branchStock.deleteMany({});
    await prisma.usageRecord.deleteMany({});
    await prisma.expense.deleteMany({});
    await prisma.sessionSettlement.deleteMany({});
    await prisma.sessionReconciliation.deleteMany({});
    await prisma.attendance.deleteMany({});
    await prisma.shiftRegister.deleteMany({});
    await prisma.session.deleteMany({});
    await prisma.student.deleteMany({});
    await prisma.teacher.deleteMany({});
    await prisma.room.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.branch.deleteMany({});
    await prisma.systemSetting.deleteMany({});
    await prisma.user.deleteMany({});
    // Cascades to subscriptions.
    await prisma.tenant.deleteMany({});
  }

  const call = (method: string, url: string, authToken: string, payload?: unknown) =>
    app.inject({
      method,
      url,
      headers: authHeaders(authToken),
      ...(payload === undefined ? {} : { payload }),
    });

  before(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL as string;
    const { PrismaClient } = await import('@prisma/client');
    prisma = new PrismaClient();
    const { buildApp } = await import('../../../src/server/app.js');
    app = buildApp() as unknown as FastifyLike;
    await app.ready();
    app.log.level = 'silent';
    await clean();
    await seed();
  });

  after(async () => {
    await clean();
    await app.close();
    await prisma.$disconnect();
  });

  describe('a room may not be created inside another center\'s branch', () => {
    test('refuses a foreign branch and creates nothing', async () => {
      const res = await call('POST', '/api/management/rooms', adminB, {
        name: 'قاعة مسروقة',
        capacity: 20,
        branchId: branchAId,
      });

      assert.equal(res.statusCode, 404, res.body);
      assert.equal(errorCode(res.body), 'BRANCH_NOT_FOUND');
      assert.deepEqual(await prisma.room.findMany({}), [], 'a room was created against a foreign branch');
    });

    test('refuses a malformed branch id at the schema', async () => {
      const res = await call('POST', '/api/management/rooms', adminB, {
        name: 'قاعة بمعرف غريب',
        capacity: 10,
        branchId: 'not-a-uuid',
      });

      assert.equal(res.statusCode, 400, res.body);
      assert.deepEqual(await prisma.room.findMany({}), [], 'a room was created from an unvalidated branch id');
    });

    test("assigns the caller's own branch and reports it back", async () => {
      const res = await call('POST', '/api/management/rooms', adminB, {
        name: 'قاعة ب',
        capacity: 30,
        branchId: branchBId,
      });

      assert.equal(res.statusCode, 201, res.body);
      const room = json(res.body).data.room;
      assert.equal(room.branchId, branchBId);

      const stored = await prisma.room.findUnique({ where: { id: room.id } });
      assert.equal(stored.branchId, branchBId, "the room did not keep B's own branch");

      const listed = await call('GET', '/api/management/rooms', adminB);
      const rooms = json(listed.body).data.rooms as Array<{ id: string; branchId: string | null }>;
      assert.equal(rooms.find((r) => r.id === room.id)?.branchId, branchBId);
    });
  });

  describe('a room may not be moved into another center\'s branch', () => {
    let roomBId: string;

    before(async () => {
      roomBId = (
        await prisma.room.create({ data: { tenantId: tenantBId, name: 'قاعة قابلة للنقل', capacity: 15 } })
      ).id;
    });

    test('refuses a foreign branch and leaves the room where it was', async () => {
      const res = await call('PATCH', `/api/management/rooms/${roomBId}`, adminB, { branchId: branchAId });

      assert.equal(res.statusCode, 404, res.body);
      assert.equal(errorCode(res.body), 'BRANCH_NOT_FOUND');

      const stored = await prisma.room.findUnique({ where: { id: roomBId } });
      assert.equal(stored.branchId, null, 'the refused move still changed the room');
    });

    test("moves the room inside the caller's own centers", async () => {
      const res = await call('PATCH', `/api/management/rooms/${roomBId}`, adminB, { branchId: branchBId });

      assert.equal(res.statusCode, 200, res.body);
      assert.equal(json(res.body).data.room.branchId, branchBId);
    });
  });

  describe('a branch that still holds rooms cannot be deleted', () => {
    test('refuses the delete instead of silently detaching the room', async () => {
      // `rooms.branch_id` was ON DELETE SET NULL, which contradicted this route:
      // it answers "cannot delete branch associated with rooms", but the database
      // accepted the delete and cleared the column — quietly losing which branch
      // the room bills against, and making the refusal unreachable dead code.
      const roomOnB = await prisma.room.findFirst({ where: { branchId: branchBId } });
      assert.ok(roomOnB, 'expected a room assigned to B');

      const res = await call('DELETE', `/api/branches/${branchBId}`, adminB);

      assert.equal(res.statusCode, 409, res.body);
      const stillThere = await prisma.room.findUnique({ where: { id: roomOnB.id } });
      assert.equal(stillThere.branchId, branchBId, 'the room lost its branch anyway');
    });

    test('a branch with no rooms is still deletable', async () => {
      const empty = await prisma.branch.create({ data: { tenantId: tenantBId, name: 'فرع فارغ', isActive: true } });
      const res = await call('DELETE', `/api/branches/${empty.id}`, adminB);

      assert.equal(res.statusCode, 200, res.body);
      assert.equal(await prisma.branch.findUnique({ where: { id: empty.id } }), null);
    });
  });

  describe('the database itself refuses a row that belongs to no center', () => {
    test('a null tenant_id is rejected by every core table', async () => {
      const core = [
        'attendances',
        'expenses',
        'rooms',
        'session_reconciliations',
        'session_settlements',
        'sessions',
        'shift_registers',
        'students',
        'teachers',
      ];

      for (const table of core) {
        const rows = await prisma.$queryRawUnsafe(
          `SELECT is_nullable FROM information_schema.columns WHERE table_name = $1 AND column_name = 'tenant_id'`,
          table,
        );
        assert.equal(rows[0]?.is_nullable, 'NO', `${table}.tenant_id is still nullable`);
      }

      // And the write is genuinely refused, not merely undocumented in the schema.
      // A student is the smallest core row that takes a bare insert. Prisma reports
      // a failed raw query as P2010 and carries the driver's own code in `meta`, so
      // 23502 (not_null_violation) has to be read from there.
      await assert.rejects(
        () =>
          prisma.$executeRawUnsafe(
            `INSERT INTO students (tenant_id, student_code, full_name, search_name, guardian_phone, academic_stage)
             VALUES (NULL, 'X1', 'طالب بلا مركز', 'طالب بلا مركز', '01000000001', 'PRIMARY')`,
          ),
        (error: any) => error?.meta?.code === '23502' || /not-null|null value in column "tenant_id"/i.test(String(error?.message)),
        'an unowned student was accepted',
      );

      const orphans = await prisma.$queryRawUnsafe(
        `SELECT (SELECT count(*) FROM students WHERE tenant_id IS NULL)
              + (SELECT count(*) FROM sessions WHERE tenant_id IS NULL)
              + (SELECT count(*) FROM rooms WHERE tenant_id IS NULL) AS n`,
      );
      assert.equal(Number(orphans[0].n), 0, 'an unowned core row is present');
    });

    test('a platform super admin still exists with no center', async () => {
      // The counter-example that keeps `users`, `audit_logs` and
      // `system_health_events` nullable: platform rows legitimately have no tenant.
      const platformUser = await prisma.user.create({
        data: {
          tenantId: null,
          username: 'rb_platform_admin',
          fullName: 'مشرف المنصة',
          passwordHash: 'x',
          role: 'ADMIN',
        },
      });

      assert.equal(platformUser.tenantId, null);
      await prisma.user.delete({ where: { id: platformUser.id } });
    });
  });
});
