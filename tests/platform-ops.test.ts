import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { Role } from '../src/shared/constants/index.js';
import { FEATURE_FLAG_CATALOG } from '../src/server/modules/admin/platformOps.js';
import { createTestApp, superAdminAuth, adminAuth, receptionistAuth, authHeaders, errorCode, signToken, validUUID } from './helpers.js';

const PLATFORM_READ_ROUTES = [
  '/api/admin/stats',
  '/api/admin/console-stats',
  '/api/admin/tenants',
  `/api/admin/tenants/${validUUID('11')}`,
  '/api/admin/audit-logs',
  '/api/admin/users',
  `/api/admin/users/${validUUID('12')}`,
  '/api/admin/usage',
  '/api/admin/usage-overrides',
  '/api/admin/subscriptions',
  '/api/admin/billing/adjustments',
  '/api/admin/revenue',
  '/api/admin/support-notes',
  '/api/admin/notifications',
  '/api/admin/feature-flags',
  '/api/admin/system-health/checks',
  '/api/admin/system-health/events',
  '/api/admin/settings',
  '/api/admin/super-audit',
  '/api/admin/data/status',
  '/api/admin/data/export/tenants',
  '/api/admin/data/export/users',
  '/api/admin/security/sessions',
  '/api/admin/security/history',
  '/api/admin/account',
];

const PLATFORM_WRITE_ROUTES: { method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'; url: string; payload?: unknown }[] = [
  { method: 'POST', url: '/api/admin/system-health/checks' },
  { method: 'PUT', url: '/api/admin/settings', payload: { settings: { 'platform.name': 'x' } } },
  { method: 'PUT', url: `/api/admin/feature-flags/${FEATURE_FLAG_CATALOG[0].key}`, payload: { enabled: true } },
  { method: 'DELETE', url: `/api/admin/feature-flags/${FEATURE_FLAG_CATALOG[0].key}` },
  { method: 'PATCH', url: '/api/admin/account', payload: { fullName: 'Test Name' } },
  { method: 'POST', url: `/api/admin/security/sessions/${validUUID('1')}/revoke` },
  { method: 'POST', url: `/api/admin/notifications/${validUUID('2')}/send` },
  { method: 'POST', url: `/api/admin/notifications/${validUUID('3')}/archive` },
  { method: 'POST', url: `/api/admin/system-health/events/${validUUID('4')}/resolve` },
  {
    method: 'POST',
    url: '/api/admin/tenants',
    payload: {
      name: 'Gate Test Center',
      ownerName: 'Gate Owner',
      ownerPhone: '01011112222',
      username: 'gate_test_center',
      password: 'GatePass123',
      plan: 'ESSENTIAL',
    },
  },
  { method: 'PATCH', url: `/api/admin/tenants/${validUUID('11')}/limits`, payload: { maxUsers: 7, reason: 'Gate test' } },
  { method: 'PATCH', url: `/api/admin/tenants/${validUUID('11')}/extend-trial`, payload: { days: 7 } },
  { method: 'PATCH', url: `/api/admin/tenants/${validUUID('11')}/suspend`, payload: { isActive: false } },
  { method: 'POST', url: `/api/admin/tenants/${validUUID('11')}/view-as`, payload: { reason: 'Gate test' } },
  { method: 'POST', url: '/api/admin/view-as/return', payload: { sessionId: validUUID('11') } },
  {
    method: 'POST',
    url: '/api/admin/users',
    payload: { centerId: validUUID('11'), username: 'gate_user', fullName: 'Gate User', password: 'GatePass123' },
  },
  {
    method: 'PATCH',
    url: `/api/admin/users/${validUUID('12')}`,
    payload: { role: 'RECEPTIONIST', isActive: false, reason: 'Gate test' },
  },
  { method: 'POST', url: `/api/admin/users/${validUUID('12')}/reset-password`, payload: { reason: 'Gate test' } },
  { method: 'POST', url: `/api/admin/users/${validUUID('12')}/revoke-sessions`, payload: { reason: 'Gate test' } },
  {
    method: 'POST',
    url: '/api/admin/subscriptions',
    payload: { tenantId: validUUID('11'), plan: 'ESSENTIAL', paymentMethod: 'INSTAPAY', paymentReference: 'GATE-1' },
  },
  { method: 'POST', url: `/api/admin/subscriptions/${validUUID('13')}/cancel`, payload: { reason: 'Gate test', immediate: true } },
  { method: 'POST', url: `/api/admin/subscriptions/${validUUID('13')}/reactivate`, payload: { reason: 'Gate test' } },
  { method: 'POST', url: `/api/admin/subscriptions/${validUUID('13')}/discount`, payload: { kind: 'PERCENT', value: 10, reason: 'Gate test' } },
  { method: 'POST', url: `/api/admin/subscriptions/${validUUID('13')}/credit`, payload: { amount: 100, reason: 'Gate test' } },
  { method: 'POST', url: `/api/admin/subscriptions/${validUUID('13')}/refund`, payload: { amount: 100, reason: 'Gate test' } },
  {
    method: 'POST',
    url: '/api/admin/usage-overrides',
    payload: { tenantId: validUUID('11'), metric: 'VISITS', extraAmount: 10, reason: 'Gate test' },
  },
  { method: 'DELETE', url: `/api/admin/usage-overrides/${validUUID('14')}` },
  { method: 'POST', url: '/api/admin/support-notes', payload: { tenantId: validUUID('11'), text: 'Gate test note' } },
  { method: 'PATCH', url: `/api/admin/support-notes/${validUUID('15')}`, payload: { status: 'RESOLVED' } },
  { method: 'PATCH', url: '/api/admin/account/password', payload: { currentPassword: 'GatePass123', newPassword: 'GatePass456' } },
];

const PLATFORM_NOTIFICATION_ROUTES: { method: 'POST'; url: string; payload: unknown }[] = [
  {
    method: 'POST',
    url: '/api/admin/notifications',
    payload: { titleAr: 'صيانة مجدولة', bodyAr: 'سيتم إيقاف الخدمة مؤقتًا.', audience: 'ALL_CENTERS' },
  },
];

describe('PLATFORM OPS — authentication gate (no DB required)', () => {
  test('every platform-ops read route rejects a missing token with 401', async () => {
    const app = await createTestApp();
    for (const url of PLATFORM_READ_ROUTES) {
      const res = await app.inject({ method: 'GET', url });
      assert.equal(res.statusCode, 401, `${url} must require authentication`);
      assert.equal(errorCode(res.body), 'UNAUTHORIZED', `${url} must return UNAUTHORIZED`);
    }
    await app.close();
  });

  test('every platform-ops write route rejects a missing token with 401', async () => {
    const app = await createTestApp();
    for (const route of PLATFORM_WRITE_ROUTES) {
      const res = await app.inject({ method: route.method, url: route.url, payload: route.payload });
      assert.equal(res.statusCode, 401, `${route.method} ${route.url} must require authentication`);
      assert.equal(errorCode(res.body), 'UNAUTHORIZED');
    }
    for (const route of PLATFORM_NOTIFICATION_ROUTES) {
      const res = await app.inject({ method: route.method, url: route.url, payload: route.payload });
      assert.equal(res.statusCode, 401, `${route.method} ${route.url} must require authentication`);
    }
    await app.close();
  });

  test('every platform-ops write route rejects a malformed token with 401', async () => {
    const app = await createTestApp();
    for (const route of PLATFORM_WRITE_ROUTES) {
      const res = await app.inject({
        method: route.method,
        url: route.url,
        headers: { authorization: 'Bearer not-a-real-jwt' },
        payload: route.payload,
      });
      assert.equal(res.statusCode, 401, `${route.method} ${route.url} must reject a malformed token`);
    }
    for (const route of PLATFORM_NOTIFICATION_ROUTES) {
      const res = await app.inject({
        method: route.method,
        url: route.url,
        headers: { authorization: 'Bearer not-a-real-jwt' },
        payload: route.payload,
      });
      assert.equal(res.statusCode, 401, `${route.method} ${route.url} must reject a malformed token`);
    }
    await app.close();
  });
});

describe('PLATFORM OPS — RBAC: Super Admin is fully separated from center roles', () => {
  test('a center ADMIN cannot read any platform-ops route -> 403 FORBIDDEN', async () => {
    const app = await createTestApp();
    const { token } = adminAuth(app);
    for (const url of PLATFORM_READ_ROUTES) {
      const res = await app.inject({ method: 'GET', url, headers: authHeaders(token) });
      assert.equal(res.statusCode, 403, `${url} must be forbidden for a center admin`);
      assert.equal(errorCode(res.body), 'FORBIDDEN');
    }
    await app.close();
  });

  test('a center ADMIN cannot perform any platform-ops write -> 403', async () => {
    const app = await createTestApp();
    const { token } = adminAuth(app);
    for (const route of PLATFORM_WRITE_ROUTES) {
      const res = await app.inject({
        method: route.method,
        url: route.url,
        headers: authHeaders(token),
        payload: route.payload,
      });
      assert.equal(res.statusCode, 403, `${route.method} ${route.url} must be forbidden for a center admin`);
      assert.equal(errorCode(res.body), 'FORBIDDEN');
    }
    for (const route of PLATFORM_NOTIFICATION_ROUTES) {
      const res = await app.inject({
        method: route.method,
        url: route.url,
        headers: authHeaders(token),
        payload: route.payload,
      });
      assert.equal(res.statusCode, 403, `${route.method} ${route.url} must be forbidden for a center admin`);
    }
    await app.close();
  });

  test('a RECEPTIONIST cannot read or write any platform-ops route -> 403', async () => {
    const app = await createTestApp();
    const { token } = receptionistAuth(app);
    for (const url of PLATFORM_READ_ROUTES) {
      const read = await app.inject({ method: 'GET', url, headers: authHeaders(token) });
      assert.equal(read.statusCode, 403, `${url} must be forbidden for a receptionist`);
    }
    const write = await app.inject({
      method: 'PUT',
      url: '/api/admin/settings',
      headers: authHeaders(token),
      payload: { settings: { 'platform.name': 'hijacked' } },
    });
    assert.equal(write.statusCode, 403);
    assert.equal(errorCode(write.body), 'FORBIDDEN');
    await app.close();
  });

  test('an impersonation token (ADMIN + tenantId) cannot reach platform-ops routes', async () => {
    const app = await createTestApp();
    const impersonation = app.jwt.sign({
      sub: validUUID('dddddddd-0000-0000-0000-000000000004'),
      username: 'superadmin',
      role: Role.ADMIN,
      tenantId: validUUID('eeeeeeee-0000-0000-0000-000000000005'),
    } as never);
    for (const url of PLATFORM_READ_ROUTES) {
      const res = await app.inject({ method: 'GET', url, headers: authHeaders(impersonation) });
      assert.equal(res.statusCode, 403, `${url} must stay unreachable with an impersonation token`);
    }
    await app.close();
  });

  test('a SUPER_ADMIN passes the gate on every platform-ops read route (not 401/403)', async () => {
    const app = await createTestApp();
    const { token } = superAdminAuth(app);
    for (const url of PLATFORM_READ_ROUTES) {
      const res = await app.inject({ method: 'GET', url, headers: authHeaders(token) });
      assert.notEqual(res.statusCode, 401, `${url} must not reject a super admin`);
      assert.notEqual(res.statusCode, 403, `${url} must not forbid a super admin`);
    }
    await app.close();
  });
});

describe('PLATFORM OPS — input validation runs before any DB access', () => {
  test('settings rejects an unknown key with 400 VALIDATION/setting error', async () => {
    const app = await createTestApp();
    const { token } = superAdminAuth(app);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/settings',
      headers: authHeaders(token),
      payload: { settings: { 'platform.notARealKey': 'x' } },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'INVALID_SETTING_VALUE');
    await app.close();
  });

  test('settings rejects a wrong-typed value for a known key with 400', async () => {
    const app = await createTestApp();
    const { token } = superAdminAuth(app);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/settings',
      headers: authHeaders(token),
      payload: { settings: { 'platform.maintenanceMode': 'yes-please' } },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'INVALID_SETTING_VALUE');
    await app.close();
  });

  test('feature flags reject an unknown flag key with 404 UNKNOWN_FEATURE_FLAG', async () => {
    const app = await createTestApp();
    const { token } = superAdminAuth(app);
    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/feature-flags/not_a_real_flag',
      headers: authHeaders(token),
      payload: { enabled: true },
    });
    assert.equal(res.statusCode, 404);
    assert.equal(errorCode(res.body), 'UNKNOWN_FEATURE_FLAG');
    await app.close();
  });

  test('notifications require audience targets for targeted audiences', async () => {
    const app = await createTestApp();
    const { token } = superAdminAuth(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/notifications',
      headers: authHeaders(token),
      payload: { titleAr: 'صيانة', bodyAr: 'سيتم التوقف المؤقت', audience: 'PLAN' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'AUDIENCE_IDS_REQUIRED');
    await app.close();
  });

  test('notifications reject an unknown audience enum value via schema validation', async () => {
    const app = await createTestApp();
    const { token } = superAdminAuth(app);
    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/notifications',
      headers: authHeaders(token),
      payload: { titleAr: 'x', bodyAr: 'y', audience: 'EVERYONE_EVER' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
    await app.close();
  });

  test('account update rejects a non-Egyptian phone number via schema validation', async () => {
    const app = await createTestApp();
    const { token } = superAdminAuth(app);
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/account',
      headers: authHeaders(token),
      payload: { phoneNumber: '1234567890' },
    });
    assert.equal(res.statusCode, 400);
    assert.equal(errorCode(res.body), 'VALIDATION_ERROR');
    await app.close();
  });

  test('account update accepts a valid Egyptian mobile number at the schema layer', async () => {
    const app = await createTestApp();
    const { token } = superAdminAuth(app);
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/admin/account',
      headers: authHeaders(token),
      payload: { phoneNumber: '01011112222' },
    });
    assert.notEqual(res.statusCode, 400, 'a valid Egyptian mobile must pass schema validation');
    await app.close();
  });
});

describe('PLATFORM OPS — feature flag catalog is a single source of truth', () => {
  test('the catalog exposes unique, non-empty flag keys', () => {
    const keys = FEATURE_FLAG_CATALOG.map((flag) => flag.key);
    assert.ok(keys.length > 0, 'catalog must not be empty');
    assert.equal(new Set(keys).size, keys.length, 'flag keys must be unique');
    for (const flag of FEATURE_FLAG_CATALOG) {
      assert.ok(flag.key.length > 0);
      assert.ok(flag.labelAr.length > 0, `${flag.key} needs an Arabic label`);
      assert.ok(flag.descriptionAr.length > 0, `${flag.key} needs an Arabic description`);
    }
  });
});

describe('PLATFORM OPS — token separation', () => {
  test('a token signed with an unknown role cannot reach platform-ops routes', async () => {
    const app = await createTestApp();
    const forged = signToken(app, { sub: validUUID('ffffffff-0000-0000-0000-000000000006'), username: 'root', role: 'ROOT' as Role });
    const res = await app.inject({ method: 'GET', url: '/api/admin/settings', headers: authHeaders(forged) });
    assert.equal(res.statusCode, 403);
    await app.close();
  });
});
