import test from 'node:test';
import assert from 'node:assert/strict';

// Its own process (node:test isolates per file) so NODE_ENV is 'development'
// before the config module loads, which is the only way the route is registered.
process.env.NODE_ENV = 'development';

const { buildApp } = await import('../src/server/app.js');

/**
 * The counterpart to tests/production-demo-endpoint.test.ts, and the reason that
 * test is not satisfied by deleting the endpoint: fencing the demo reset off is
 * correct, removing it is not. A developer needs one command to take a local
 * database to a demo-able state, and this route is that command.
 *
 * The gate is asserted on the route table, so this needs no database and — the
 * point of the exercise — no schema change to answer.
 */
test('the development demo reset endpoint is still registered', async () => {
  const app = buildApp();
  app.log.level = 'silent';
  await app.ready();
  try {
    assert.ok(
      app.hasRoute({ method: 'GET', url: '/api/setup-demo' }),
      'development must keep /api/setup-demo; fencing it off is not the same as deleting it',
    );
  } finally {
    await app.close();
  }
});