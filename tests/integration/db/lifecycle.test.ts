import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

// This suite exercises the real PostgreSQL database through the Fastify app.
// It is skipped unless TEST_DATABASE_URL points at a disposable test database
// that has the Prisma schema applied (`npm run db:migrate:deploy`).
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

/**
 * This suite is destructive: `clean()` empties every business table before each
 * run. The project's own `.env` points DATABASE_URL at a live Supabase
 * instance, so a mis-set TEST_DATABASE_URL would wipe real data. Refuse to run
 * unless the target is unambiguously disposable.
 */
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
  jwt: { sign(payload: Record<string, unknown>, opts?: { expiresIn?: string }): string; verify(token: string): { sub: string } };
  inject(opts: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    payload?: unknown;
  }): Promise<{ statusCode: number; body: string }>;
};

type PrismaLike = Record<string, unknown>;

const authHeaders = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

function json(body: string): any {
  return JSON.parse(body);
}

describe(
  'DB-backed integration lifecycle',
  { skip: !TEST_DATABASE_URL },
  () => {
    let app: FastifyLike;
    let prisma: any;
    let adminToken: string;
    let receptionistToken: string;
    let otherReceptionistToken: string;
    let tenantlessToken: string;
    let receptionistId: string;
    let otherReceptionistId: string;
    let adminId: string;
    let tenantId: string;
    let subscriptionId: string;

    const students: Record<string, string> = {};
    const sessions: Record<string, string> = {};
    const openShiftIds: string[] = [];
    const settledSessions: string[] = [];

    const now = new Date();
    const today = now.toISOString().slice(0, 10);

    async function seed(): Promise<void> {
      const argon2 = await import('argon2');

      // A real center. Every record below is scoped to it, and every token is
      // signed with it, because `requireTenantWritable` fails closed without a
      // tenant and scopes every query by it.
      const tenant = await prisma.tenant.create({
        data: { name: 'مركز الاختبار التكاملي', slug: `int-center-${Date.now()}`, isActive: true },
      });
      tenantId = tenant.id;

      const admin = await prisma.user.create({
        data: {
          tenantId,
          username: 'int_admin',
          fullName: 'مدير الاختبارات',
          passwordHash: await argon2.hash('IntAdmin@123'),
          role: 'ADMIN',
          phoneNumber: '01000000000',
          preferredLanguage: 'ar',
          isActive: true,
        },
      });
      adminId = admin.id;

      const reception1 = await prisma.user.create({
        data: {
          tenantId,
          username: 'int_recep1',
          fullName: 'استقبال واحد',
          passwordHash: await argon2.hash('IntDesk@123'),
          role: 'RECEPTIONIST',
          phoneNumber: '01011111111',
          preferredLanguage: 'ar',
          isActive: true,
        },
      });
      receptionistId = reception1.id;

      const reception2 = await prisma.user.create({
        data: {
          tenantId,
          username: 'int_recep2',
          fullName: 'استقبال اثنان',
          passwordHash: await argon2.hash('IntDesk@123'),
          role: 'RECEPTIONIST',
          phoneNumber: '01022222222',
          preferredLanguage: 'ar',
          isActive: true,
        },
      });
      otherReceptionistId = reception2.id;

      const room = await prisma.room.create({ data: { tenantId, name: 'قاعة الاختبار التكاملية', capacity: 50, isActive: true } });
      const teacher = await prisma.teacher.create({
        data: {
          tenantId,
          fullName: 'م/ اختبار التكامل',
          searchName: 'م/ اختبار التكامل',
          phoneNumber: '01033333333',
          subject: 'فيزياء',
          defaultCenterFee: 20,
          isActive: true,
        },
      });

      for (let i = 1; i <= 5; i += 1) {
        const s = await prisma.student.create({
          data: {
            tenantId,
            studentCode: `INT-${String(i).padStart(5, '0')}`,
            fullName: `طالب اختبار ${i}`,
            searchName: `طالب اختبار ${i}`,
            guardianPhone: `011111${String(10000 + i)}`,
            academicStage: 'الثالث الثانوي',
            schoolType: 'GENERAL',
          },
        });
        students[`S${i}`] = s.id;
      }

      const stage = 'الثالث الثانوي';
      const makeSession = async (title: string, startOffsetMin: number) => {
        const s = await prisma.session.create({
          data: {
            tenantId,
            teacherId: teacher.id,
            roomId: room.id,
            title,
            academicStage: stage,
            startTime: new Date(now.getTime() + startOffsetMin * 60_000),
            endTime: new Date(now.getTime() + (startOffsetMin + 60) * 60_000),
            sessionPrice: 150,
            centerFeePerStudent: 20,
            status: 'SCHEDULED',
            createdById: adminId,
          },
        });
        return s.id;
      };

      sessions.A = await makeSession('حصة الدفع الثلاثي', 5);
      sessions.B = await makeSession('حصة التوافق', 65);
      sessions.C = await makeSession('حصة التصفية النقدية', 125);
      sessions.D = await makeSession('حصة تحويل فودافون', 185);
      sessions.E = await makeSession('حصة إنستاباي', 245);

      // A live paid period: the only thing that makes this center writable.
      // The lifecycle guard reads nothing but Subscription rows.
      const subscription = await prisma.subscription.create({
        data: {
          tenantId,
          plan: 'GROWTH',
          amount: 1199,
          status: 'ACTIVE',
          periodStart: new Date(now.getTime() - 5 * 24 * 60 * 60_000),
          periodEnd: new Date(now.getTime() + 25 * 24 * 60 * 60_000),
        },
      });
      subscriptionId = subscription.id;
    }

    /** Rewind the seeded subscription to a precise lifecycle scenario. */
    async function setSubscriptionState(periodEnd: Date, status: 'ACTIVE' | 'PENDING' | 'CANCELED' | 'EXPIRED' | 'TRIALING' | 'PAST_DUE' = 'ACTIVE'): Promise<void> {
      // Upsert, because the "no subscription at all" scenario deletes the row
      // and the restore that follows has to bring it back.
      const data = {
        tenantId,
        plan: 'GROWTH' as const,
        amount: 1199,
        status,
        periodStart: new Date(periodEnd.getTime() - 30 * 24 * 60 * 60_000),
        periodEnd,
      };
      await prisma.subscription.upsert({
        where: { id: subscriptionId },
        create: { id: subscriptionId, ...data },
        update: data,
      });
    }

    /** The state a center is in before it has ever paid. */
    async function clearSubscription(): Promise<void> {
      await prisma.subscription.deleteMany({ where: { id: subscriptionId } });
    }

    const restoreActiveSubscription = () =>
      setSubscriptionState(new Date(now.getTime() + 25 * 24 * 60 * 60_000), 'ACTIVE');

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
      await prisma.user.deleteMany({});
      // Cascades to subscriptions, so the next seed starts from a clean center.
      await prisma.tenant.deleteMany({});
    }

    async function openShift(token: string, desk = 'Desk 1', openingCash = 500): Promise<string> {
      // Scaffolding: each test below needs its own shift, and the product rightly
      // refuses two open shifts per receptionist. Retire the previous one
      // directly instead of going through the close endpoint, so the SHIFT CLOSE
      // test still gets to exercise the real variance arithmetic on its own
      // shift. This conflict was invisible while the whole suite was failing
      // earlier for unrelated reasons.
      const claims = app.jwt.verify(token);
      await prisma.shiftRegister.updateMany({
        where: { receptionistId: claims.sub, status: 'OPEN' },
        data: { status: 'CLOSED', closedAt: new Date() },
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/shifts/open',
        headers: authHeaders(token),
        payload: { deskIdentifier: desk, openingCash },
      });
      assert.equal(res.statusCode, 201, `open shift failed: ${res.body}`);
      const shift = json(res.body).data.shift;
      openShiftIds.push(shift.id);
      return shift.id;
    }

    async function checkin(token: string, sessionId: string, studentId: string, payload: Record<string, unknown>) {
      return app.inject({
        method: 'POST',
        url: '/api/attendances/checkin',
        headers: authHeaders(token),
        payload: { sessionId, studentId, ...payload },
      });
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

      adminToken = app.jwt.sign({ sub: adminId, username: 'int_admin', role: 'ADMIN', tenantId }, { expiresIn: '1h' });
      receptionistToken = app.jwt.sign({ sub: receptionistId, username: 'int_recep1', role: 'RECEPTIONIST', tenantId }, { expiresIn: '1h' });
      otherReceptionistToken = app.jwt.sign({ sub: otherReceptionistId, username: 'int_recep2', role: 'RECEPTIONIST', tenantId }, { expiresIn: '1h' });
      // Deliberately tenant-less: proves the guard fails closed rather than
      // letting a token with no center through.
      tenantlessToken = app.jwt.sign({ sub: receptionistId, username: 'int_recep1', role: 'RECEPTIONIST' }, { expiresIn: '1h' });
    });

    after(async () => {
      await app.close();
      await prisma.$disconnect();
    });

    test('AUTH: real login succeeds and wrong credentials are rejected', async () => {
      const ok = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'int_recep1', password: 'IntDesk@123' },
      });
      assert.equal(ok.statusCode, 200);
      assert.equal(json(ok.body).data.user.role, 'RECEPTIONIST');

      const bad = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { username: 'int_recep1', password: 'wrong-password' },
      });
      assert.equal(bad.statusCode, 401);
      assert.equal(json(bad.body).error.code, 'INVALID_CREDENTIALS');
    });

    test('CHECKIN: all three payment methods record one attendance each', async () => {
      await openShift(receptionistToken, 'Desk 1', 500);

      const cash = await checkin(receptionistToken, sessions.A, students.S1, { paymentMethod: 'CASH' });
      assert.equal(cash.statusCode, 201, cash.body);
      assert.equal(json(cash.body).data.attendance.paymentMethod, 'CASH');
      assert.equal(json(cash.body).data.attendance.changeOwed, 0);

      const vf = await checkin(receptionistToken, sessions.A, students.S2, {
        paymentMethod: 'VODAFONE_CASH',
        paymentReference: '01111111111',
      });
      assert.equal(vf.statusCode, 201, vf.body);
      assert.equal(json(vf.body).data.attendance.paymentMethod, 'VODAFONE_CASH');

      const insta = await checkin(receptionistToken, sessions.A, students.S3, {
        paymentMethod: 'INSTAPAY',
        paymentReference: 'insta-0001',
        amountPaid: 200,
      });
      assert.equal(insta.statusCode, 201, insta.body);
      assert.equal(json(insta.body).data.attendance.changeOwed, 50);

      const list = await app.inject({
        method: 'GET',
        url: `/api/attendances/sessions/${sessions.A}/attendances`,
        headers: authHeaders(receptionistToken),
      });
      assert.equal(list.statusCode, 200);
      assert.equal(json(list.body).data.attendances.length, 3);
    });

    test('CHECKIN: a sequential duplicate check-in is rejected with 409', async () => {
      const dup = await checkin(receptionistToken, sessions.A, students.S1, { paymentMethod: 'CASH' });
      assert.equal(dup.statusCode, 409);
      assert.equal(json(dup.body).error.code, 'DUPLICATE_CHECK_IN');
    });

    test('CONCURRENCY: simultaneous duplicate check-ins yield exactly one success and one 409', async () => {
      const first = checkin(receptionistToken, sessions.B, students.S1, { paymentMethod: 'CASH' });
      const second = checkin(receptionistToken, sessions.B, students.S1, { paymentMethod: 'CASH' });
      const [a, b] = await Promise.allSettled([first, second]);
      const results = [a, b].map((r) => (r.status === 'fulfilled' ? r.value.statusCode : -1)).sort();
      assert.deepEqual(results, [201, 409]);

      const count = await prisma.attendance.count({ where: { sessionId: sessions.B, studentId: students.S1 } });
      assert.equal(count, 1);
    });

    test('RECONCILIATION: mismatched counts require resolution notes', async () => {
      const openId = await openShift(receptionistToken, 'Desk 2', 500);
      await checkin(receptionistToken, sessions.C, students.S2, { paymentMethod: 'CASH' });
      await checkin(receptionistToken, sessions.C, students.S3, { paymentMethod: 'CASH' });

      const noNotes = await app.inject({
        method: 'POST',
        url: `/api/sessions/${sessions.C}/reconcile`,
        headers: authHeaders(receptionistToken),
        payload: { assistantCount: 3, reconciledHeadcount: 2 },
      });
      assert.equal(noNotes.statusCode, 400);
      assert.equal(json(noNotes.body).error.code, 'RECONCILIATION_REQUIRED');

      const withNotes = await app.inject({
        method: 'POST',
        url: `/api/sessions/${sessions.C}/reconcile`,
        headers: authHeaders(receptionistToken),
        payload: { assistantCount: 3, reconciledHeadcount: 2, resolutionNotes: 'قدم طالب متأخراً' },
      });
      assert.equal(withNotes.statusCode, 200, withNotes.body);
      assert.equal(json(withNotes.body).data.reconciliation.discrepancy, 1);

      openShiftIds.push(openId);
    });

    test('SETTLEMENT: cash payout computes server-side amounts and locks the session', async () => {
      const openId = await openShift(receptionistToken, 'Desk 1', 500);
      const settle = await app.inject({
        method: 'POST',
        url: `/api/sessions/${sessions.C}/settle`,
        headers: authHeaders(receptionistToken),
        payload: { payoutMethod: 'CASH', recipientName: 'م/ اختبار التكامل' },
      });
      assert.equal(settle.statusCode, 201, settle.body);
      const s = json(settle.body).data.settlement;
      assert.equal(s.totalRevenue, 300);
      assert.equal(s.centerShare, 40);
      assert.equal(s.teacherPayout, 260);
      assert.equal(s.payoutMethod, 'CASH');
      settledSessions.push(sessions.C);

      const lock = await app.inject({
        method: 'POST',
        url: `/api/sessions/${sessions.C}/settle`,
        headers: authHeaders(receptionistToken),
        payload: { payoutMethod: 'CASH', recipientName: 'م/ آخر' },
      });
      assert.equal(lock.statusCode, 409);
      assert.equal(json(lock.body).error.code, 'SESSION_LOCKED');

      const reconLock = await app.inject({
        method: 'POST',
        url: `/api/sessions/${sessions.C}/reconcile`,
        headers: authHeaders(receptionistToken),
        payload: { assistantCount: 2, reconciledHeadcount: 2 },
      });
      assert.equal(reconLock.statusCode, 409);
      assert.equal(json(reconLock.body).error.code, 'SESSION_LOCKED');

      openShiftIds.push(openId);
    });

    test('SETTLEMENT: Vodafone Cash and InstaPay payout paths record disbursed settlements', async () => {
      for (const [key, method, studentKey, reference] of [
        ['D', 'VODAFONE_CASH', 'S1', '01012345678'],
        ['E', 'INSTAPAY', 'S2', 'insta-9999'],
      ] as const) {
        const openId = await openShift(receptionistToken, key === 'D' ? 'Desk 1' : 'Desk 2', 500);
        await checkin(receptionistToken, sessions[key], students[studentKey], { paymentMethod: method, paymentReference: reference });
        const recon = await app.inject({
          method: 'POST',
          url: `/api/sessions/${sessions[key]}/reconcile`,
          headers: authHeaders(receptionistToken),
          payload: { assistantCount: 1, reconciledHeadcount: 1 },
        });
        assert.equal(recon.statusCode, 200, recon.body);
        const settle = await app.inject({
          method: 'POST',
          url: `/api/sessions/${sessions[key]}/settle`,
          headers: authHeaders(receptionistToken),
          payload: { payoutMethod: method, recipientName: 'م/ اختبار التكامل' },
        });
        assert.equal(settle.statusCode, 201, settle.body);
        const s = json(settle.body).data.settlement;
        assert.equal(s.payoutMethod, method);
        assert.equal(s.teacherPayout, 130);
        settledSessions.push(sessions[key]);
        openShiftIds.push(openId);
      }
    });

    test('SHIFT CLOSE: exact count, overage, and shortage variances are persisted', async () => {
      const exact = await app.inject({
        method: 'POST',
        url: '/api/shifts/close',
        headers: authHeaders(receptionistToken),
        payload: { actualCashCounted: 500 },
      });
      assert.equal(exact.statusCode, 200, exact.body);
      assert.equal(json(exact.body).data.shift.cashVariance, 0);

      await openShift(receptionistToken, 'Desk 1', 1000);
      const shortage = await app.inject({
        method: 'POST',
        url: '/api/shifts/close',
        headers: authHeaders(receptionistToken),
        payload: { actualCashCounted: 950 },
      });
      assert.equal(shortage.statusCode, 200);
      assert.equal(json(shortage.body).data.shift.cashVariance, -50);

      await openShift(receptionistToken, 'Desk 1', 1000);
      const overage = await app.inject({
        method: 'POST',
        url: '/api/shifts/close',
        headers: authHeaders(receptionistToken),
        payload: { actualCashCounted: 1050 },
      });
      assert.equal(overage.statusCode, 200);
      assert.equal(json(overage.body).data.shift.cashVariance, 50);
    });

    test('REPORT: daily summary captures attendees, settlements, and digital collections', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/reports/daily?date=${today}`,
        headers: authHeaders(adminToken),
      });
      assert.equal(res.statusCode, 200, res.body);
      const data = json(res.body).data;
      assert.equal(data.totalAttendees, 8);
      assert.equal(data.centerNetRevenue, 40 + 20 + 20);
      assert.equal(data.teacherPayouts, 260 + 130 + 130);
      assert.ok(data.digitalCollections > 0);
      assert.ok(data.digitalCollectionsByMethod.vodafoneCash > 0);
      assert.ok(data.digitalCollectionsByMethod.instapay > 0);
      assert.equal(settledSessions.length, 3);
    });

    test('REPORT: voided attendance records are excluded from the totals', async () => {
      const voided = await prisma.attendance.findFirst({ where: { sessionId: sessions.B } });
      assert.ok(voided);
      await prisma.attendance.update({ where: { id: voided.id }, data: { status: 'VOID' } });

      const res = await app.inject({
        method: 'GET',
        url: `/api/reports/daily?date=${today}`,
        headers: authHeaders(adminToken),
      });
      assert.equal(res.statusCode, 200);
      assert.equal(json(res.body).data.totalAttendees, 7);
    });

    test('REPORT: a day without data reports zero totals', async () => {
      const farPast = '2000-01-01';
      const res = await app.inject({
        method: 'GET',
        url: `/api/reports/daily?date=${farPast}`,
        headers: authHeaders(adminToken),
      });
      assert.equal(res.statusCode, 200);
      const data = json(res.body).data;
      assert.equal(data.totalAttendees, 0);
      assert.equal(data.centerNetRevenue, 0);
      assert.equal(data.teacherPayouts, 0);
    });

    test('AUDIT: entries are ordered, actor-attributed, and scoped by shift ownership', async () => {
      const shiftId = openShiftIds[0];
      assert.ok(shiftId);

      const asAdmin = await app.inject({
        method: 'GET',
        url: `/api/reports/shifts/${shiftId}/audit`,
        headers: authHeaders(adminToken),
      });
      assert.equal(asAdmin.statusCode, 200, asAdmin.body);
      const data = json(asAdmin.body).data;
      assert.ok(data.entries.length >= 2);
      const actions = data.entries.map((e: any) => e.action);
      assert.ok(actions.includes('SHIFT_OPENED'));
      assert.ok(actions.includes('ATTENDANCE_CHECKED_IN'));

      const times = data.entries.map((e: any) => new Date(e.createdAt).getTime());
      assert.deepEqual(times, [...times].sort((x: number, y: number) => x - y));

      const checkinEntry = data.entries.find((e: any) => e.action === 'ATTENDANCE_CHECKED_IN');
      assert.ok(checkinEntry);
      assert.equal(checkinEntry.actor.role, 'RECEPTIONIST');
      assert.equal(checkinEntry.actor.id, receptionistId);

      const asOwner = await app.inject({
        method: 'GET',
        url: `/api/reports/shifts/${shiftId}/audit`,
        headers: authHeaders(receptionistToken),
      });
      assert.equal(asOwner.statusCode, 200);

      const asOther = await app.inject({
        method: 'GET',
        url: `/api/reports/shifts/${shiftId}/audit`,
        headers: authHeaders(otherReceptionistToken),
      });
      assert.equal(asOther.statusCode, 403);
      assert.equal(json(asOther.body).error.code, 'AUDIT_ACCESS_DENIED');
    });

    // --- Subscription lifecycle, exercised through the real database ---------
    //
    // These assert the guard's whole contract against actual Subscription rows
    // rather than a stubbed resolver: reads stay open through every state, and
    // only writes are closed, and only while closed.

    const createStudent = (token: string) =>
      app.inject({
        method: 'POST',
        url: '/api/registry/students',
        headers: authHeaders(token),
        payload: { fullName: 'طالب دورة الحياة', guardianPhone: '01255556666', academicStage: 'الثالث الثانوي' },
      });

    const listStudents = (token: string) =>
      app.inject({ method: 'GET', url: '/api/registry/students', headers: authHeaders(token) });

    test('LIFECYCLE: a center with no subscription is read-only, not locked out', async () => {
      await clearSubscription();
      try {
        const write = await createStudent(adminToken);
        assert.equal(write.statusCode, 403, write.body);
        assert.equal(json(write.body).error.code, 'TENANT_NOT_APPROVED');

        const read = await listStudents(adminToken);
        assert.equal(read.statusCode, 200, read.body);
      } finally {
        await restoreActiveSubscription();
      }
    });

    test('LIFECYCLE: a rejected payment never gets a grace period', async () => {
      // This is exactly what POST /:id/reject writes: status CANCELED with
      // periodEnd stamped at the moment of rejection. Because the rejection is
      // never ACTIVE, it must not be mistaken for a paid period that lapsed and
      // must not earn the center seven free days.
      await setSubscriptionState(new Date(now.getTime() - 2 * 24 * 60 * 60_000), 'CANCELED');
      try {
        const write = await createStudent(adminToken);
        assert.equal(write.statusCode, 403, write.body);
        assert.equal(json(write.body).error.code, 'TENANT_NOT_APPROVED');
      } finally {
        await restoreActiveSubscription();
      }
    });

    test('LIFECYCLE: an active center can still write', async () => {
      await restoreActiveSubscription();
      const write = await createStudent(adminToken);
      assert.equal(write.statusCode, 201, write.body);
    });

    test('LIFECYCLE: an expired center keeps writing through the full grace window', async () => {
      // Expired 3 days ago: still inside the 7-day grace.
      await setSubscriptionState(new Date(now.getTime() - 3 * 24 * 60 * 60_000));
      try {
        const write = await createStudent(adminToken);
        assert.equal(write.statusCode, 201, write.body);
      } finally {
        await restoreActiveSubscription();
      }
    });

    test('LIFECYCLE: past the grace window writes freeze but reads do not', async () => {
      // Expired 10 days ago, so past period end + 7 grace days.
      await setSubscriptionState(new Date(now.getTime() - 10 * 24 * 60 * 60_000));
      try {
        const write = await createStudent(adminToken);
        assert.equal(write.statusCode, 403, write.body);
        assert.equal(json(write.body).error.code, 'TENANT_FROZEN');

        const read = await listStudents(adminToken);
        assert.equal(read.statusCode, 200, read.body);
      } finally {
        await restoreActiveSubscription();
      }
    });

    test('LIFECYCLE: a frozen center is restored by paying again', async () => {
      await setSubscriptionState(new Date(now.getTime() - 10 * 24 * 60 * 60_000));
      assert.equal((await createStudent(adminToken)).statusCode, 403);

      await restoreActiveSubscription();
      const write = await createStudent(adminToken);
      assert.equal(write.statusCode, 201, write.body);
    });

    test('LIFECYCLE: a token with no tenant is rejected rather than trusted', async () => {
      const write = await createStudent(tenantlessToken);
      assert.equal(write.statusCode, 403, write.body);
      assert.equal(json(write.body).error.code, 'TENANT_CONTEXT_MISSING');
    });

    test('LIFECYCLE: a frozen center cannot check a student in either', async () => {
      await setSubscriptionState(new Date(now.getTime() - 10 * 24 * 60 * 60_000));
      try {
        const res = await checkin(receptionistToken, sessions.A, students.S1, { paymentMethod: 'CASH' });
        assert.equal(res.statusCode, 403, res.body);
        assert.equal(json(res.body).error.code, 'TENANT_FROZEN');
      } finally {
        await restoreActiveSubscription();
      }
    });

    test('LIFECYCLE: the current-subscription endpoint reports the state to the client', async () => {
      const endpoint = () => app.inject({ method: 'GET', url: '/api/subscriptions/current', headers: authHeaders(adminToken) });

      await setSubscriptionState(new Date(now.getTime() + 25 * 24 * 60 * 60_000));
      const active = await endpoint();
      assert.equal(active.statusCode, 200, active.body);
      assert.equal(json(active.body).data.lifecycle.state, 'ACTIVE');

      await setSubscriptionState(new Date(now.getTime() - 10 * 24 * 60 * 60_000));
      const frozen = await endpoint();
      assert.equal(frozen.statusCode, 200, frozen.body);
      assert.equal(json(frozen.body).data.lifecycle.state, 'FROZEN');

      await restoreActiveSubscription();
    });
  },
);