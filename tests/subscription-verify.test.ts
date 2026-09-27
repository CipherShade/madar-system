import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, superAdminAuth, adminAuth, authHeaders, errorCode, validUUID } from './helpers.js';

describe('SUBSCRIPTION PAYMENT VERIFICATION guards (no DB required)', () => {
  test('GET /api/subscriptions/pending requires SUPER_ADMIN (401 anonymous / 403 non-super)', async () => {
    const app = await createTestApp();

    const anon = await app.inject({ method: 'GET', url: '/api/subscriptions/pending' });
    assert.equal(anon.statusCode, 401);
    assert.equal(errorCode(anon.body), 'UNAUTHORIZED');

    const nonSuper = await app.inject({ method: 'GET', url: '/api/subscriptions/pending', headers: authHeaders(adminAuth(app).token) });
    assert.equal(nonSuper.statusCode, 403);
    assert.equal(errorCode(nonSuper.body), 'FORBIDDEN');

    await app.close();
  });

  test('POST /api/subscriptions/:id/verify requires SUPER_ADMIN (401 anonymous / 403 non-super)', async () => {
    const app = await createTestApp();
    const id = validUUID('99999999-0000-0000-0000-000000000009');

    const anon = await app.inject({ method: 'POST', url: `/api/subscriptions/${id}/verify` });
    assert.equal(anon.statusCode, 401);

    const nonSuper = await app.inject({ method: 'POST', url: `/api/subscriptions/${id}/verify`, headers: authHeaders(adminAuth(app).token) });
    assert.equal(nonSuper.statusCode, 403);

    await app.close();
  });

  test('POST /api/subscriptions/:id/reject requires SUPER_ADMIN (401 anonymous / 403 non-super)', async () => {
    const app = await createTestApp();
    const id = validUUID('99999999-0000-0000-0000-000000000008');

    const anon = await app.inject({ method: 'POST', url: `/api/subscriptions/${id}/reject` });
    assert.equal(anon.statusCode, 401);

    const nonSuper = await app.inject({ method: 'POST', url: `/api/subscriptions/${id}/reject`, headers: authHeaders(adminAuth(app).token) });
    assert.equal(nonSuper.statusCode, 403);

    await app.close();
  });

  test('verify/reject reject a malformed UUID with 400 INVALID_ID (before any DB access)', async () => {
    const app = await createTestApp();
    const headers = authHeaders(superAdminAuth(app).token);

    for (const action of ['verify', 'reject'] as const) {
      const res = await app.inject({ method: 'POST', url: `/api/subscriptions/not-a-uuid/${action}` as string, headers });
      assert.equal(res.statusCode, 400, `${action} with bad id should be 400`);
      assert.equal(errorCode(res.body), 'INVALID_ID');
    }

    await app.close();
  });
});