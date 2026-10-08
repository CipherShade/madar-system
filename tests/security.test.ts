import test from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyRequest, FastifyReply } from 'fastify';

import { buildApp } from '../src/server/app.js';
import {
  createRateLimiter,
  parseJwtExpiresInSeconds,
  signCookieValue,
  unsignCookieValue,
} from '../src/server/lib/security.js';

function errorCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: string } };
    return parsed.error?.code;
  } catch {
    return undefined;
  }
}

test('parseJwtExpiresInSeconds converts cloud-friendly durations', () => {
  assert.equal(parseJwtExpiresInSeconds('12h'), 43200);
  assert.equal(parseJwtExpiresInSeconds('1d'), 86400);
  assert.equal(parseJwtExpiresInSeconds('30m'), 1800);
  assert.equal(parseJwtExpiresInSeconds('45s'), 45);
  assert.equal(parseJwtExpiresInSeconds('1w'), 604800);
  assert.equal(parseJwtExpiresInSeconds('900'), 900);
  assert.equal(parseJwtExpiresInSeconds(''), 43200);
  assert.equal(parseJwtExpiresInSeconds('not-a-duration'), 43200);
});

test('signCookieValue/unsignCookieValue round-trip and reject tampering', () => {
  const secret = 'test-cookie-secret';
  const signed = signCookieValue('header.payload.signature', secret);
  assert.equal(unsignCookieValue(signed, secret), 'header.payload.signature');

  assert.equal(unsignCookieValue(signed, 'wrong-secret'), null);
  assert.equal(unsignCookieValue(`${signed}x`, secret), null);
  assert.equal(unsignCookieValue('', secret), null);
  assert.equal(unsignCookieValue('no-dot', secret), null);
});

test('createRateLimiter blocks once the fixed window is exceeded', async () => {
  const limiter = createRateLimiter({
    windowMs: 60_000,
    max: 2,
    keyBy: (request) => (request.headers['x-rate-key'] as string) ?? 'default',
  });

  const makeReply = () => {
    let status = 200;
    return {
      reply: {
        code(code: number) {
          status = code;
          return this;
        },
        send() {
          return this;
        },
        status: () => status,
      },
    };
  };

  const fire = async (key: string): Promise<number> => {
    const mock = makeReply();
    await limiter(
      { headers: { 'x-rate-key': key } } as unknown as FastifyRequest,
      mock.reply as unknown as FastifyReply,
    );
    return mock.reply.status();
  };

  assert.equal(await fire('a'), 200);
  assert.equal(await fire('a'), 200);
  assert.equal(await fire('a'), 429);
  assert.equal(await fire('b'), 200);
  assert.equal(await fire('a'), 429);
});

test('createRateLimiter drops expired windows instead of retaining every key forever', async () => {
  let now = 1_000_000;
  const limiter = createRateLimiter({
    windowMs: 1_000,
    max: 1,
    now: () => now,
    keyBy: (request) => (request.headers['x-rate-key'] as string) ?? 'default',
  });

  const fire = async (key: string): Promise<number> => {
    let status = 200;
    const reply = {
      code(code: number) {
        status = code;
        return this;
      },
      send() {
        return this;
      },
      status: () => status,
    };
    await limiter(
      { headers: { 'x-rate-key': key } } as unknown as FastifyRequest,
      reply as unknown as FastifyReply,
    );
    return status;
  };

  assert.equal(await fire('a'), 200);
  assert.equal(await fire('a'), 429);

  now += 1_001; // one window passes, so the next call sweeps the expired entry
  assert.equal(await fire('b'), 200);
  assert.equal(await fire('a'), 200, 'a key past its window should start fresh');
});

test('login rate limit returns 429 RATE_LIMITED before reaching the handler', async () => {
  const app = buildApp({ rateLimit: { login: { max: 1 } } });
  app.log.level = 'silent';
  await app.ready();
  try {
    const first = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'Password123!' },
    });
    assert.notEqual(errorCode(first.body), 'RATE_LIMITED');

    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'Password123!' },
    });
    assert.equal(second.statusCode, 429);
    assert.equal(errorCode(second.body), 'RATE_LIMITED');
  } finally {
    await app.close();
  }
});

test('CSRF origin guard blocks state-changing requests from untrusted origins', async () => {
  const app = await buildApp();
  app.log.level = 'silent';
  await app.ready();
  try {
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { origin: 'https://evil.example' },
    });
    assert.equal(blocked.statusCode, 403);
    assert.equal(errorCode(blocked.body), 'CSRF_ORIGIN_BLOCKED');

    const allowed = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: { origin: 'http://localhost:5173' },
    });
    assert.equal(allowed.statusCode, 200);

    const noOrigin = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    assert.equal(noOrigin.statusCode, 200);

    const getWithEvilOrigin = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'https://evil.example' },
    });
    assert.notEqual(getWithEvilOrigin.statusCode, 403);
  } finally {
    await app.close();
  }
});

test('error handler does not leak internal messages for 4xx responses', async () => {
  const app = await buildApp();
  app.log.level = 'silent';
  await app.ready();
  try {
    const res = await app.inject({ method: 'POST', url: '/api/route-does-not-exist' });
    assert.equal(res.statusCode, 404);
    const parsed = JSON.parse(res.body) as { error?: { messageEn?: string; code?: string } };
    assert.equal(parsed.error?.code, 'NOT_FOUND');
    assert.equal(parsed.error.messageEn, 'The requested endpoint was not found.');
    assert.ok(!res.body.includes('route-does-not-exist'));
  } finally {
    await app.close();
  }
});

test('GET and OPTIONS are exempt from the CSRF origin check', async () => {
  const app = await buildApp();
  app.log.level = 'silent';
  await app.ready();
  try {
    const options = await app.inject({
      method: 'OPTIONS',
      url: '/api/auth/login',
      headers: { origin: 'https://evil.example' },
    });
    assert.notEqual(options.statusCode, 403);
  } finally {
    await app.close();
  }
});