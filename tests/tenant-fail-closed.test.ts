import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { Role } from '../src/shared/constants/index.js';
import {
  ADMIN_USER_ID,
  RECEPTIONIST_USER_ID,
  authHeaders,
  createTestApp,
  errorCode,
  signToken,
  validUUID,
} from './helpers.js';

/**
 * Every tenant-owned route must fail closed when the authenticated user belongs
 * to no center. A `tenantId` claim is absent on a super-admin token and on any
 * token minted before a user was attached to a tenant, so "no tenant" is a
 * reachable state, not a hypothetical one.
 *
 * The failure mode this pins down is the dangerous one: code that *drops* the
 * tenant filter when the claim is missing instead of refusing. That reads and
 * writes every center's data at once, which is precisely the cross-tenant leak
 * the scoping work removed.
 *
 * No database is needed: a fail-closed branch answers before any query runs, so
 * these assertions hold with `fastify.inject()` alone. Real two-tenant
 * behaviour lives in `tests/integration/db/tenant-isolation.test.ts`.
 */

/** A syntactically valid id that belongs to no seeded record. */
const FOREIGN_ID = validUUID('9f9f9f9f-9f9f-9f9f-9f9f-9f9f9f9f9f9f');
const OTHER_ID = validUUID('8e8e8e8e-8e8e-8e8e-8e8e-8e8e8e8e8e8e');

function inAnHour(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}

/**
 * An ADMIN token carrying `tenantId: null`. ADMIN rather than SUPER_ADMIN on
 * purpose: SUPER_ADMIN is meant to cross tenants and is gated out of these
 * routes, so only its presence would prove the route is closed to the wrong
 * audience. This token clears both the role check and the lifecycle guard's
 * lookup, so the refusal can only come from the tenant check itself.
 */
function centerlessAdmin(app: FastifyInstance): string {
  return signToken(app, { sub: ADMIN_USER_ID, username: 'centerless', role: Role.ADMIN, tenantId: null });
}

type WriteCase = {
  name: string;
  method: 'POST' | 'PATCH' | 'DELETE';
  url: string;
  payload?: Record<string, unknown>;
};

/**
 * One entry per tenant business write. Every payload satisfies its route's JSON
 * schema on purpose: Fastify validates before `preHandler`, so an invalid body
 * would answer 400 for a reason that has nothing to do with tenancy and the
 * test would pass without ever reaching the tenant guard.
 */
const TENANTLESS_WRITES: WriteCase[] = [
  { name: 'POST /api/registry/students', method: 'POST', url: '/api/registry/students', payload: { fullName: 'طالب بلا مركز', guardianPhone: '01000000001', academicStage: 'الثالث الثانوي' } },
  { name: 'PATCH /api/registry/students/:id', method: 'PATCH', url: `/api/registry/students/${FOREIGN_ID}`, payload: {} },
  { name: 'DELETE /api/registry/students/:id', method: 'DELETE', url: `/api/registry/students/${FOREIGN_ID}` },

  { name: 'POST /api/management/rooms', method: 'POST', url: '/api/management/rooms', payload: { name: 'قاعة بلا مركز', capacity: 20 } },
  { name: 'PATCH /api/management/rooms/:id', method: 'PATCH', url: `/api/management/rooms/${FOREIGN_ID}`, payload: {} },
  { name: 'DELETE /api/management/rooms/:id', method: 'DELETE', url: `/api/management/rooms/${FOREIGN_ID}` },

  { name: 'POST /api/management/teachers', method: 'POST', url: '/api/management/teachers', payload: { fullName: 'مدرس بلا مركز', phoneNumber: '01000000002', subject: 'رياضيات', defaultCenterFee: 20 } },
  { name: 'PATCH /api/management/teachers/:id', method: 'PATCH', url: `/api/management/teachers/${FOREIGN_ID}`, payload: {} },
  { name: 'DELETE /api/management/teachers/:id', method: 'DELETE', url: `/api/management/teachers/${FOREIGN_ID}` },

  { name: 'POST /api/scheduling/sessions', method: 'POST', url: '/api/scheduling/sessions', payload: { teacherId: FOREIGN_ID, roomId: FOREIGN_ID, title: 'حصة بلا مركز', academicStage: 'الثالث الثانوي', startTime: inAnHour(), endTime: inAnHour(), sessionPrice: 100, centerFeePerStudent: 10 } },
  { name: 'PATCH /api/scheduling/sessions/:id', method: 'PATCH', url: `/api/scheduling/sessions/${FOREIGN_ID}`, payload: {} },
  { name: 'DELETE /api/scheduling/sessions/:id', method: 'DELETE', url: `/api/scheduling/sessions/${FOREIGN_ID}` },

  { name: 'POST /api/attendances/checkin', method: 'POST', url: '/api/attendances/checkin', payload: { sessionId: FOREIGN_ID, studentId: OTHER_ID, paymentMethod: 'CASH' } },
  { name: 'POST /api/attendances/attendances/:id/void', method: 'POST', url: `/api/attendances/attendances/${FOREIGN_ID}/void` },

  { name: 'POST /api/sessions/:id/reconcile', method: 'POST', url: `/api/sessions/${FOREIGN_ID}/reconcile`, payload: { assistantCount: 0, reconciledHeadcount: 0 } },
  { name: 'POST /api/sessions/:id/settle', method: 'POST', url: `/api/sessions/${FOREIGN_ID}/settle`, payload: { payoutMethod: 'CASH', recipientName: 'مدرس بلا مركز' } },

  { name: 'POST /api/shifts/open', method: 'POST', url: '/api/shifts/open', payload: { deskIdentifier: 'Desk 1', openingCash: 500 } },
  { name: 'POST /api/shifts/close', method: 'POST', url: '/api/shifts/close', payload: { actualCashCounted: 500 } },
  { name: 'POST /api/shifts/expenses', method: 'POST', url: '/api/shifts/expenses', payload: { category: 'صيانة', amount: 50, paymentMethod: 'CASH', description: 'مصروف بلا مركز' } },
];

/** The only two refusals that count as "fails closed". */
const TENANT_REFUSALS = ['TENANT_CONTEXT_MISSING', 'TENANT_REQUIRED'];

describe('TENANT FAIL-CLOSED: a center-less user can never write', () => {
  let app: FastifyInstance;
  let token: string;

  before(async () => {
    app = await createTestApp({ silent: true });
    token = centerlessAdmin(app);
  });

  after(async () => {
    await app.close();
  });

  const inject = (testCase: WriteCase, authToken: string) =>
    testCase.payload === undefined
      ? app.inject({ method: testCase.method, url: testCase.url, headers: authHeaders(authToken) })
      : app.inject({
          method: testCase.method,
          url: testCase.url,
          headers: authHeaders(authToken),
          payload: testCase.payload,
        });

  for (const testCase of TENANTLESS_WRITES) {
    test(`${testCase.method} ${testCase.url.replace(FOREIGN_ID, ':id').replace(OTHER_ID, ':id2')} refuses a token with no tenant`, async () => {
      const res = await inject(testCase, token);

      const code = errorCode(res.body);
      assert.ok(
        res.statusCode >= 400,
        `${testCase.name} answered ${res.statusCode} — a write went through with no tenant. Body: ${res.body}`,
      );
      assert.ok(
        TENANT_REFUSALS.includes(code ?? ''),
        `${testCase.name} was refused for the wrong reason: ${res.statusCode} ${code ?? '(no code)'}. Body: ${res.body}`,
      );
      assert.equal(JSON.parse(res.body).success, false);
    });
  }

  test('no route answers a center-less write with 5xx', async () => {
    // A refusal that arrives as a thrown error is a refusal by accident, not by
    // design, and it would take the whole request down instead of answering it.
    for (const testCase of TENANTLESS_WRITES) {
      const res = await inject(testCase, token);
      assert.ok(res.statusCode < 500, `${testCase.name} answered ${res.statusCode}: ${res.body}`);
    }
  });
});

describe('TENANT FAIL-CLOSED: a center-less user reads nothing', () => {
  let app: FastifyInstance;
  let token: string;

  const body = (res: { body: string }): any => JSON.parse(res.body);
  const get = (url: string) => app.inject({ method: 'GET', url, headers: authHeaders(token) });

  before(async () => {
    app = await createTestApp({ silent: true });
    token = centerlessAdmin(app);
  });

  after(async () => {
    await app.close();
  });

  test('GET /api/registry/students returns an empty registry', async () => {
    const res = await get('/api/registry/students');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(body(res).data.students, []);
    assert.equal(body(res).data.pagination.total, 0);
  });

  test('GET /api/management/rooms returns no rooms', async () => {
    const res = await get('/api/management/rooms');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(body(res).data.rooms, []);
  });

  test('GET /api/management/teachers returns no teachers', async () => {
    const res = await get('/api/management/teachers');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(body(res).data.teachers, []);
  });

  test('GET /api/scheduling/sessions returns no sessions', async () => {
    const res = await get('/api/scheduling/sessions');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(body(res).data.sessions, []);
  });

  test('GET /api/attendances/sessions/active shows an empty lobby board', async () => {
    const res = await get('/api/attendances/sessions/active');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(body(res).data.sessions, []);
  });

  test('GET /api/attendances/sessions/:id/attendances returns an empty roster', async () => {
    const res = await get(`/api/attendances/sessions/${FOREIGN_ID}/attendances`);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(body(res).data.attendances, []);
    assert.equal(body(res).data.pagination.total, 0);
  });

  test('GET /api/registry/students/:id/attendances is indistinguishable from a missing student', async () => {
    // A 403 here would confirm the student's existence is being reasoned about;
    // the same 404 a nonexistent id gets is the point.
    const res = await get(`/api/registry/students/${FOREIGN_ID}/attendances`);
    assert.equal(res.statusCode, 404);
    assert.equal(body(res).success, false);
  });

  test('GET /api/shifts/current shows no open shift', async () => {
    const res = await get('/api/shifts/current');
    assert.equal(res.statusCode, 200);
    assert.equal(body(res).data.shift, null);
  });

  test('GET /api/shifts/history returns no shifts', async () => {
    const res = await get('/api/shifts/history');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(body(res).data.shifts, []);
    assert.equal(body(res).data.pagination.total, 0);
  });

  test('GET /api/reports/daily refuses a center-less account', async () => {
    const res = await get('/api/reports/daily');
    assert.equal(res.statusCode, 403);
    assert.equal(errorCode(res.body), 'TENANT_CONTEXT_MISSING');
  });

  test('GET /api/reports/shifts/:id/audit refuses a center-less account', async () => {
    const res = await get(`/api/reports/shifts/${FOREIGN_ID}/audit`);
    assert.equal(res.statusCode, 403);
    assert.equal(errorCode(res.body), 'TENANT_CONTEXT_MISSING');
  });

  test('a receptionist token with no tenant is refused the same way', async () => {
    // The desk is the role that touches the most personal data, so it gets its
    // own check rather than inheriting the ADMIN result by assumption.
    const receptionless = signToken(app, {
      sub: RECEPTIONIST_USER_ID,
      username: 'centerless-desk',
      role: Role.RECEPTIONIST,
      tenantId: null,
    });

    const roster = await app.inject({
      method: 'GET',
      url: `/api/attendances/sessions/${FOREIGN_ID}/attendances`,
      headers: authHeaders(receptionless),
    });
    assert.equal(roster.statusCode, 200);
    assert.deepEqual(body(roster).data.attendances, []);

    const checkin = await app.inject({
      method: 'POST',
      url: '/api/attendances/checkin',
      headers: authHeaders(receptionless),
      payload: { sessionId: FOREIGN_ID, studentId: OTHER_ID, paymentMethod: 'CASH' },
    });
    assert.ok(TENANT_REFUSALS.includes(errorCode(checkin.body) ?? ''), `check-in answered ${checkin.statusCode}: ${checkin.body}`);
  });
});
