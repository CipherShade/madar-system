import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// This file must run in its own process (node:test isolates per-file), so we
// can safely switch NODE_ENV to production BEFORE the config module loads.
// Otherwise app.ts would skip the SPA wildcard and this regression would not
// be exercised.
process.env.NODE_ENV = 'production';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'production-wildcard-test-jwt-secret-32-characters';
process.env.COOKIE_SECRET = 'production-wildcard-test-cookie-secret-32-characters';
process.env.CORS_ORIGIN = 'https://example.test';

const { buildApp } = await import('../src/server/app.js');

const distIndex = path.join(process.cwd(), 'dist', 'client', 'index.html');
const distPresent = fs.existsSync(distIndex);

test('production SPA wildcard returns JSON 404 for unknown GET /api/* routes', { skip: !distPresent }, async () => {
  const app = buildApp();
  app.log.level = 'silent';
  await app.ready();
  try {
    const unknown = await app.inject({ method: 'GET', url: '/api/route/that/does/not/exist' });
    assert.equal(unknown.statusCode, 404);
    assert.equal(unknown.headers['content-type'], 'application/json; charset=utf-8');
    const parsed = JSON.parse(unknown.body) as { error?: { code?: string }; success?: boolean };
    assert.equal(parsed.success, false);
    assert.equal(parsed.error?.code, 'NOT_FOUND');

    const bareApi = await app.inject({ method: 'GET', url: '/api' });
    assert.equal(bareApi.statusCode, 404);
    assert.equal((JSON.parse(bareApi.body) as { error?: { code?: string } }).error?.code, 'NOT_FOUND');

    const spa = await app.inject({ method: 'GET', url: '/14/dashboard/has-session' });
    assert.equal(spa.statusCode, 200);
    const contentType = spa.headers['content-type'] ?? '';
    assert.ok(contentType.includes('text/html'), `expected HTML for a client route, got ${contentType}`);
    assert.ok(spa.body.includes('<!DOCTYPE html>'));
  } finally {
    await app.close();
  }
});

test('compiled server source is not reachable as a static asset', { skip: !distPresent }, async () => {
  const app = buildApp();
  app.log.level = 'silent';
  await app.ready();
  try {
    // The static root used to be `dist/`, so dist/server/** was served verbatim:
    // these returned application/javascript with the backend source in the body.
    for (const url of [
      '/server/server/config/index.js',
      '/server/server/server.js',
      '/server/shared/constants/index.js',
    ]) {
      const response = await app.inject({ method: 'GET', url });
      const type = response.headers['content-type'] ?? '';
      assert.ok(!type.includes('javascript'), `${url} served as JavaScript (${type})`);
      assert.ok(
        !response.body.includes('randomBytes') && !response.body.includes('socket.io'),
        `${url} leaked compiled server source`,
      );
    }
  } finally {
    await app.close();
  }
});