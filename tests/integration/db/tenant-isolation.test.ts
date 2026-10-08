import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { todayEgyptKey } from '../../../src/server/lib/tenantLifecycle.js';

/**
 * Cross-tenant isolation against a real PostgreSQL database.
 *
 * Two centers exist for the whole suite: `A`, whose records every test attacks,
 * and `B`, the caller. Every request is made with a `B` token against an `A` row,
 * and every assertion is doubled: the response must refuse, *and* the row in the
 * database must be byte-for-byte what it was. Checking only the status code
 * would pass against a route that returns 404 and writes anyway.
 *
 * This is the half `tests/tenant-fail-closed.test.ts` cannot cover. That suite
 * proves a tenant-*less* token is refused; this one proves a token that carries
 * a real tenant, just the wrong one, cannot reach another center's row.
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
  jwt: {
    sign(payload: Record<string, unknown>, opts?: { expiresIn?: string }): string;
    verify(token: string): { sub: string };
  };
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

describe(
  'DB-backed tenant isolation: one center cannot reach another',
  { skip: !TEST_DATABASE_URL },
  () => {
    let app: FastifyLike;
    let prisma: any;

    // Tokens for the attacking center B.
    let adminB: string;
    let receptionB: string;

    // The victim's ids, all owned by center A.
    let tenantAId: string;
    let tenantBId: string;
    let studentAId: string;
    let roomAId: string;
    let teacherAId: string;
    let sessionAId: string;
    let shiftAId: string;

    // The caller's own rows, used to prove the routes still work for their owner.
    let sessionBId: string;
    let sessionB2Id: string;
    let shiftBId: string;

    const now = new Date();
    const stage = 'الثالث الثانوي';
    const today = todayEgyptKey();

    const token = (sub: string, username: string, role: string, tenantId: string) =>
      app.jwt.sign({ sub, username, role, tenantId }, { expiresIn: '1h' });

    async function seed(): Promise<void> {
      const argon2 = await import('argon2');

      const makeTenant = async (label: string) =>
        prisma.tenant.create({
          data: { name: `مركز ${label}`, slug: `iso-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, isActive: true },
        });

      const tenantA = await makeTenant('أ');
      const tenantB = await makeTenant('ب');
      tenantAId = tenantA.id;
      tenantBId = tenantB.id;

      // Both centers are paid, so `requireTenantWritable` lets every request
      // through. If it did not, these tests would pass for the wrong reason —
      // proving the lifecycle guard works, not that tenancy is scoped.
      for (const tenant of [tenantA, tenantB]) {
        await prisma.subscription.create({
          data: {
            tenantId: tenant.id,
            amount: 1199,
            status: 'ACTIVE',
            periodStart: new Date(now.getTime() - 5 * 86_400_000),
            periodEnd: new Date(now.getTime() + 25 * 86_400_000),
          },
        });
      }

      const makeUser = async (tenantId: string, username: string, fullName: string, role: string, phone: string) =>
        prisma.user.create({
          data: {
            tenantId,
            username,
            fullName,
            passwordHash: await argon2.hash('IsoDesk@123'),
            role,
            phoneNumber: phone,
            preferredLanguage: 'ar',
            isActive: true,
          },
        });

      const adminA = await makeUser(tenantA.id, 'iso_admin_a', 'مدير أ', 'ADMIN', '01000000001');
      const adminBRow = await makeUser(tenantB.id, 'iso_admin_b', 'مدير ب', 'ADMIN', '01000000002');
      const receptionBRow = await makeUser(tenantB.id, 'iso_recep_b', 'استقبال ب', 'RECEPTIONIST', '01000000003');

      adminB = token(adminBRow.id, 'iso_admin_b', 'ADMIN', tenantB.id);
      receptionB = token(receptionBRow.id, 'iso_recep_b', 'RECEPTIONIST', tenantB.id);

      const makeStudent = (tenantId: string, code: string, fullName: string, searchName: string, phone: string) =>
        prisma.student.create({
          data: { tenantId, studentCode: code, fullName, searchName, guardianPhone: phone, academicStage: stage },
        });

      // A name whose normalized form differs from the spelling a caller would
      // type: the search runs against `searchName`, so cross-tenant coverage
      // cannot pass merely because two centers happen to spell differently.
      studentAId = (await makeStudent(tenantA.id, 'ISO-A-1', 'أحمد محمد', 'احمد محمد', '01111110001')).id;
      await makeStudent(tenantB.id, 'ISO-B-1', 'أحمد إبراهيم', 'احمد ابراهيم', '01122220001');

      const roomA = await prisma.room.create({ data: { tenantId: tenantA.id, name: 'قاعة أ', capacity: 30, isActive: true } });
      const roomB = await prisma.room.create({ data: { tenantId: tenantB.id, name: 'قاعة ب', capacity: 30, isActive: true } });
      roomAId = roomA.id;

      const teacherA = await prisma.teacher.create({
        data: { tenantId: tenantA.id, fullName: 'مدرس أ', searchName: 'مدرس ا', phoneNumber: '01222220001', subject: 'رياضيات', defaultCenterFee: 20, isActive: true },
      });
      const teacherB = await prisma.teacher.create({
        data: { tenantId: tenantB.id, fullName: 'مدرس ب', searchName: 'مدرس ب', phoneNumber: '01222220002', subject: 'رياضيات', defaultCenterFee: 20, isActive: true },
      });
      teacherAId = teacherA.id;

      const makeSession = (tenantId: string, teacherId: string, roomId: string, title: string, createdById: string, offsetMin: number) =>
        prisma.session.create({
          data: {
            tenantId,
            teacherId,
            roomId,
            title,
            academicStage: stage,
            startTime: new Date(now.getTime() + offsetMin * 60_000),
            endTime: new Date(now.getTime() + (offsetMin + 60) * 60_000),
            sessionPrice: 150,
            centerFeePerStudent: 20,
            status: 'ACTIVE',
            createdById,
          },
        });

      sessionAId = (await makeSession(tenantA.id, teacherA.id, roomA.id, 'حصة أ', adminA.id, 10)).id;
      sessionBId = (await makeSession(tenantB.id, teacherB.id, roomB.id, 'حصة ب', adminBRow.id, 20)).id;
      // A second B session, so the ownership-stamping test does not depend on the
      // one above still being unsettled when it runs. Its start is clear of every
      // other session: both share teacherB, and a double-booked teacher is a
      // legitimate 409, which would mask what these tests are actually checking.
      sessionB2Id = (await makeSession(tenantB.id, teacherB.id, roomB.id, 'حصة ب الثانية', adminBRow.id, 120)).id;

      const openShiftFor = async (tenantId: string, receptionistId: string, desk: string) => {
        const shift = await prisma.shiftRegister.create({
          data: { tenantId, receptionistId, deskIdentifier: desk, openingCash: 500, status: 'OPEN' },
        });
        await prisma.auditLog.create({
          data: { tenantId, shiftRegisterId: shift.id, actorId: receptionistId, action: 'SHIFT_OPENED', entityType: 'SHIFT', entityId: shift.id, amount: 500 },
        });
        return shift;
      };

      shiftAId = (await openShiftFor(tenantA.id, adminA.id, 'Desk A')).id;
      shiftBId = (await openShiftFor(tenantB.id, receptionBRow.id, 'Desk B')).id;

      // One real attendance, for A only. It exists so the daily report and the
      // shift audit have something of A's to leak if the scoping is wrong. Only
      // one, because (session_id, student_id) is unique and both shifts are open.
      await prisma.attendance.create({
        data: {
          tenantId: tenantA.id,
          sessionId: sessionAId,
          studentId: studentAId,
          receptionistId: adminA.id,
          shiftRegisterId: shiftAId,
          amountPaid: 150,
          paymentMethod: 'CASH',
          status: 'PAID',
        },
      });
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
      await prisma.tenant.deleteMany({});
    }

    const call = (method: string, url: string, authToken: string, payload?: unknown) =>
      app.inject({
        method,
        url,
        headers: authHeaders(authToken),
        ...(payload === undefined ? {} : { payload }),
      });

    /** The first student of a given center, used to build a valid positive case. */
    async function firstStudentId(tenantId: string): Promise<string> {
      const student = await prisma.student.findFirst({ where: { tenantId }, orderBy: { studentCode: 'asc' } });
      if (!student) throw new Error(`no student seeded for tenant ${tenantId}`);
      return student.id;
    }

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

    describe('a foreign row is indistinguishable from a missing one', () => {
      /**
       * Asserts the refusal a tenant route owes: 404, no `data` payload, and no
       * trace of A's record anywhere in the response body. The last check is the
       * one that actually distinguishes "hidden" from "refused but described" —
       * a message like "student belongs to another center" confirms existence
       * just as well as returning the row.
       *
       * The code is asserted too, and it is not a formality. These 404s used to
       * answer `VALIDATION_ERROR` through a shared helper default, which says the
       * request was malformed rather than that the row is gone. The cross-tenant
       * refusal and an honest "this student does not exist" are the same 404, and
       * `tests/error-codes.test.ts` pins that shape across the whole server.
       */
      const assertInvisible = (
        res: { statusCode: number; body: string },
        what: string,
        expectedCode: string,
        secrets: string[] = A_SECRETS,
      ) => {
        assert.equal(res.statusCode, 404, `${what}: ${res.body}`);
        const body = json(res.body);
        assert.equal(body.success, false);
        assert.equal(body.data ?? null, null, `${what}: the refusal still returned data`);
        assert.equal(errorCode(res.body), expectedCode, `${what}: wrong code for a missing row`);
        for (const secret of secrets) {
          assert.equal(res.body.includes(secret), false, `${what}: the response leaked "${secret}"`);
        }
      };

      const A_SECRETS = ['طالب أ', 'مدرس أ', 'قاعة أ', 'STD-A-1', 'حصة أ'];

      test('PATCH /api/registry/students/:id refuses another center\'s student', async () => {
        const before = await prisma.student.findUnique({ where: { id: studentAId } });
        const res = await call('PATCH', `/api/registry/students/${studentAId}`, adminB, { fullName: 'اسم مُختَرَق' });

        await assertInvisible(res, 'student PATCH', 'STUDENT_NOT_FOUND');

        const after = await prisma.student.findUnique({ where: { id: studentAId } });
        assert.equal(after.fullName, before.fullName, 'the foreign student was renamed');
        assert.equal(after.tenantId, tenantAId);
      });

      test('DELETE /api/registry/students/:id refuses another center\'s student', async () => {
        const res = await call('DELETE', `/api/registry/students/${studentAId}`, adminB);
        await assertInvisible(res, 'student DELETE', 'STUDENT_NOT_FOUND');
        assert.ok(await prisma.student.findUnique({ where: { id: studentAId } }), 'the foreign student was deleted');
      });

      test('GET /api/registry/students/:id/attendances hides another center\'s payments', async () => {
        const res = await call('GET', `/api/registry/students/${studentAId}/attendances`, adminB);
        await assertInvisible(res, 'student attendances', 'STUDENT_NOT_FOUND');
      });

      test('PATCH and DELETE /api/management/rooms/:id refuse another center\'s room', async () => {
        const patch = await call('PATCH', `/api/management/rooms/${roomAId}`, adminB, { name: 'قاعة مخترقة' });
        await assertInvisible(patch, 'room PATCH', 'ROOM_NOT_FOUND');

        const remove = await call('DELETE', `/api/management/rooms/${roomAId}`, adminB);
        await assertInvisible(remove, 'room DELETE', 'ROOM_NOT_FOUND');

        const room = await prisma.room.findUnique({ where: { id: roomAId } });
        assert.equal(room.name, 'قاعة أ');
      });

      test('PATCH and DELETE /api/management/teachers/:id refuse another center\'s teacher', async () => {
        const patch = await call('PATCH', `/api/management/teachers/${teacherAId}`, adminB, { defaultCenterFee: 0 });
        await assertInvisible(patch, 'teacher PATCH', 'TEACHER_NOT_FOUND');

        const remove = await call('DELETE', `/api/management/teachers/${teacherAId}`, adminB);
        await assertInvisible(remove, 'teacher DELETE', 'TEACHER_NOT_FOUND');

        const teacher = await prisma.teacher.findUnique({ where: { id: teacherAId } });
        assert.equal(Number(teacher.defaultCenterFee), 20);
      });

      test('PATCH and DELETE /api/scheduling/sessions/:id refuse another center\'s session', async () => {
        const patch = await call('PATCH', `/api/scheduling/sessions/${sessionAId}`, adminB, { sessionPrice: 1 });
        await assertInvisible(patch, 'session PATCH', 'SESSION_NOT_FOUND');

        const remove = await call('DELETE', `/api/scheduling/sessions/${sessionAId}`, adminB);
        await assertInvisible(remove, 'session DELETE', 'SESSION_NOT_FOUND');

        const session = await prisma.session.findUnique({ where: { id: sessionAId } });
        assert.equal(Number(session.sessionPrice), 150);
        assert.equal(session.status, 'ACTIVE', 'the foreign session was cancelled');
      });

      test('POST /api/attendances/checkin refuses another center\'s session and student', async () => {
        const res = await call('POST', '/api/attendances/checkin', receptionB, {
          sessionId: sessionAId,
          studentId: studentAId,
          paymentMethod: 'CASH',
        });

        assert.equal(res.statusCode, 404, res.body);
        assert.equal(errorCode(res.body), 'SESSION_NOT_FOUND');

        // The dangerous outcome is not the refusal, it is one center's student
        // appearing in another center's session and being billed to B's tenant.
        const written = await prisma.attendance.findMany({
          where: { sessionId: sessionAId, tenantId: { not: tenantAId } },
        });
        assert.deepEqual(written, [], 'a foreign attendance was written');

        const bAttendances = await prisma.attendance.findMany({ where: { tenantId: { not: tenantAId } } });
        assert.equal(bAttendances.length, 0);
      });

      test('POST /api/attendances/checkin refuses another center\'s session using B\'s OWN student', async () => {
        // This is the exploit, and it is why the guard cannot live on the student
        // lookup. With B's own valid student, every other guard passes: the
        // student exists, the receptionist holds an open shift, the session is
        // ACTIVE and unbooked. Only the session's own tenant check can refuse,
        // and only the session scope can stop A's session absorbing B's money and
        // A's teacher payout.
        //
        // The test above cannot stand in for this one: it uses A's student, so an
        // unscoped session lookup is caught a moment later by the student guard,
        // and the suite goes red for the wrong reason.
        const res = await call('POST', '/api/attendances/checkin', receptionB, {
          sessionId: sessionAId,
          studentId: await firstStudentId(tenantBId),
          paymentMethod: 'CASH',
        });

        assert.equal(res.statusCode, 404, res.body);

        const written = await prisma.attendance.findMany({
          where: { sessionId: sessionAId, tenantId: { not: tenantAId } },
        });
        assert.deepEqual(written, [], 'a foreign attendance was written');

        // And B's own student must not have been charged either.
        const studentBId = await firstStudentId(tenantBId);
        const bStudentAttendances = await prisma.attendance.findMany({ where: { studentId: studentBId } });
        assert.deepEqual(bStudentAttendances, [], "B's own student was charged for another center's session");
      });

      test('POST /api/sessions/:id/reconcile refuses another center\'s session', async () => {
        const res = await call('POST', `/api/sessions/${sessionAId}/reconcile`, adminB, {
          assistantCount: 5,
          reconciledHeadcount: 5,
        });

        assert.equal(res.statusCode, 404, res.body);
        assert.equal(errorCode(res.body), 'SESSION_NOT_FOUND');
        assert.equal(await prisma.sessionReconciliation.count({ where: { sessionId: sessionAId } }), 0);
      });

      test('POST /api/sessions/:id/settle refuses another center\'s session', async () => {
        const res = await call('POST', `/api/sessions/${sessionAId}/settle`, adminB, {
          payoutMethod: 'CASH',
          recipientName: 'مدرس أ',
        });

        assert.equal(res.statusCode, 404, res.body);
        assert.equal(errorCode(res.body), 'SESSION_NOT_FOUND');
        assert.equal(await prisma.sessionSettlement.count({ where: { sessionId: sessionAId } }), 0);

        const session = await prisma.session.findUnique({ where: { id: sessionAId } });
        assert.equal(session.status, 'ACTIVE', 'the foreign session was locked COMPLETED by a foreign payout');
      });

      test('GET /api/reports/shifts/:shiftId/audit hides another center\'s drawer', async () => {
        const res = await call('GET', `/api/reports/shifts/${shiftAId}/audit`, adminB);
        assert.equal(res.statusCode, 404, res.body);
        assert.equal(errorCode(res.body), 'SHIFT_NOT_FOUND');
      });
    });

    describe('a foreign row never appears in a list', () => {
      test('the registry search does not return another center\'s students', async () => {
        // The name is written with a Hamza while the seed normalized it away, so
        // a tenant-blind search would still match it.
        const res = await call('GET', '/api/registry/students?search=' + encodeURIComponent('احمد'), adminB);
        assert.equal(res.statusCode, 200, res.body);

        const ids = json(res.body).data.students.map((student: { id: string }) => student.id);
        assert.equal(ids.includes(studentAId), false, "center A's student turned up in B's registry");
      });

      test('the lobby board shows only the caller\'s sessions', async () => {
        const res = await call('GET', '/api/attendances/sessions/active', receptionB);
        assert.equal(res.statusCode, 200, res.body);

        const ids = json(res.body).data.sessions.map((session: { id: string }) => session.id);
        assert.equal(ids.includes(sessionAId), false);
        assert.equal(ids.includes(sessionBId), true, "B's own session should be on B's lobby board");
      });

      test('a roster is empty for another center\'s session', async () => {
        const res = await call('GET', `/api/attendances/sessions/${sessionAId}/attendances`, receptionB);
        assert.equal(res.statusCode, 200, res.body);
        assert.deepEqual(json(res.body).data.attendances, []);
      });

      test('the daily report counts only the caller\'s attendances', async () => {
        const res = await call('GET', `/api/reports/daily?date=${today}`, adminB);
        assert.equal(res.statusCode, 200, res.body);
        assert.equal(json(res.body).data.totalAttendees, 0, "A's attendance was counted in B's report");
      });

      test('the shift history shows only the caller\'s shifts', async () => {
        const res = await call('GET', '/api/shifts/history', receptionB);
        assert.equal(res.statusCode, 200, res.body);

        const ids = json(res.body).data.shifts.map((shift: { id: string }) => shift.id);
        assert.equal(ids.includes(shiftAId), false);
      });
    });

    describe('a center keeps full access to its own rows', () => {
      test('B can check in, read, edit, reconcile and settle its own session', async () => {
        // The negative tests above would also pass if every route were simply
        // broken, so each one is paired with a positive on the caller's own data.
        //
        // The order is the real operational order, and it matters: reconcile
        // computes its discrepancy from the live lobby count, and settle draws
        // against the receptionist's own open shift, so the attendance has to
        // exist before the reconcile and the shift has to still be open after it.
        const studentBId = await firstStudentId(tenantBId);

        const checkin = await call('POST', '/api/attendances/checkin', receptionB, {
          sessionId: sessionBId,
          studentId: studentBId,
          paymentMethod: 'CASH',
        });
        assert.equal(checkin.statusCode, 201, checkin.body);

        const attendance = await prisma.attendance.findFirst({ where: { sessionId: sessionBId } });
        assert.equal(attendance.tenantId, tenantBId, 'the attendance was stamped with the wrong tenant');

        const roster = await call('GET', `/api/attendances/sessions/${sessionBId}/attendances`, receptionB);
        assert.equal(roster.statusCode, 200, roster.body);
        assert.equal(json(roster.body).data.attendances.length, 1);

        const patch = await call('PATCH', `/api/scheduling/sessions/${sessionBId}`, adminB, { title: 'حصة ب المعدّلة' });
        assert.equal(patch.statusCode, 200, patch.body);

        // One attendee in the lobby, one confirmed by the assistant: no
        // discrepancy, so no resolution note is required.
        const reconcile = await call('POST', `/api/sessions/${sessionBId}/reconcile`, adminB, {
          assistantCount: 1,
          reconciledHeadcount: 1,
        });
        assert.equal(reconcile.statusCode, 200, reconcile.body);

        const settle = await call('POST', `/api/sessions/${sessionBId}/settle`, receptionB, {
          payoutMethod: 'CASH',
          recipientName: 'مدرس ب',
        });
        assert.equal(settle.statusCode, 201, settle.body);
      });

      test('records a center creates are stamped with its own tenant', async () => {
        // The nullable tenant_id columns made it possible to write a row that no
        // center owns — invisible to every tenant-scoped read, so a payout would
        // silently vanish from the dashboard.
        // This session has no attendees, so the lobby count is 0 and an
        // assistant count of 0 leaves the discrepancy at 0.
        const reconcile = await call('POST', `/api/sessions/${sessionB2Id}/reconcile`, adminB, {
          assistantCount: 0,
          reconciledHeadcount: 0,
        });
        assert.equal(reconcile.statusCode, 200, reconcile.body);

        const settle = await call('POST', `/api/sessions/${sessionB2Id}/settle`, receptionB, {
          payoutMethod: 'CASH',
          recipientName: 'مدرس ب',
        });
        assert.equal(settle.statusCode, 201, settle.body);

        const reconciliation = await prisma.sessionReconciliation.findFirst({ where: { sessionId: sessionB2Id } });
        assert.ok(reconciliation, 'B should own the reconciliation it created');
        assert.equal(reconciliation.tenantId, tenantBId, 'the reconciliation was stamped with the wrong tenant');

        const settlement = await prisma.sessionSettlement.findFirst({ where: { sessionId: sessionB2Id } });
        assert.ok(settlement, 'B should own the settlement it created');
        assert.equal(settlement.tenantId, tenantBId, 'the settlement was stamped with the wrong tenant');

        const shift = await prisma.shiftRegister.findUnique({ where: { id: shiftBId } });
        assert.equal(shift.tenantId, tenantBId, "B's shift was stamped with the wrong tenant");
      });

      test("B's own roster is readable", async () => {
        const res = await call('GET', `/api/registry/students/${await firstStudentId(tenantBId)}/attendances`, adminB);
        assert.equal(res.statusCode, 200, res.body);
      });
    });
  },
);
