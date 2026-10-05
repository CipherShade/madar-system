import test from 'node:test';
import assert from 'node:assert/strict';

// This file must run in its own process (node:test isolates per-file), so NODE_ENV
// is switched to production BEFORE the config module loads. Otherwise app.ts would
// register the route and this regression would not be exercised.
process.env.NODE_ENV = 'production';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.JWT_SECRET = 'production-demo-endpoint-test-jwt-secret-32-chars';
process.env.COOKIE_SECRET = 'production-demo-endpoint-test-cookie-secret-32';
process.env.CORS_ORIGIN = 'https://example.test';

const { buildApp } = await import('../src/server/app.js');

/**
 * `/api/setup-demo` runs `prisma db push --accept-data-loss`. It is the one place
 * in the codebase where a schema is reconciled from schema.prisma, and it exists
 * to make a local database demo-able — legitimate there, catastrophic anywhere
 * else, because --accept-data-loss is allowed to drop columns and tables and the
 * rows in them.
 *
 * It is registered behind `config.nodeEnv !== 'production'`, which looks safe and
 * is not: `nodeEnv` falls back to 'development' when NODE_ENV is unset, so a
 * deployment that forgot the variable — the one variable AGENTS.md requires
 * before a real client is taken — published an unauthenticated endpoint that
 * rewrites the schema of whatever DATABASE_URL it can reach. No auth, no CSRF
 * token, no role: the route uses `app.all`, so a GET was enough.
 *
 * Asserted here as behaviour rather than as a source pattern, because the thing
 * that has to hold is that the endpoint does not exist, not that a string matches.
 */
test('production serves no endpoint that can rewrite the schema', async () => {
  const app = buildApp();
  app.log.level = 'silent';
  await app.ready();
  try {
    // Checked by request, not by route table: `app.get('/*')` registers a
    // pattern that matches every path, so `hasRoute` reports true for anything
    // in production and proves nothing. The 404 has to come back over HTTP.
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const res = await app.inject({ method, url: '/api/setup-demo' });
      assert.equal(
        res.statusCode,
        404,
        `${method} /api/setup-demo must not exist in production, got ${res.statusCode}: ${res.body}`,
      );
      assert.doesNotMatch(res.body, /seeded successfully/i);
    }
  } finally {
    await app.close();
  }
});