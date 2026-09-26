import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';

import { Server } from 'socket.io';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import type { FastifyInstance } from 'fastify';
import { Role } from '../src/shared/constants/index.js';

import { buildApp } from '../src/server/app.js';
import { attachSocketServer } from '../src/server/lib/socket.js';
import { signCookieValue } from '../src/server/lib/security.js';
import { signToken, ADMIN_USER_ID, RECEPTIONIST_USER_ID, TEST_TENANT_ID } from './helpers.js';
import { config } from '../src/server/config/index.js';

type ServerContext = { app: FastifyInstance; io: Server; port: number };

const sockets: ClientSocket[] = [];

function makeClient(port: number, opts: { token?: string; cookie?: string } = {}): ClientSocket {
  const sock = ioc(`http://127.0.0.1:${port}`, {
    transports: ['polling'],
    forceNew: true,
    reconnection: false,
    timeout: 3000,
    ...(opts.token !== undefined ? { auth: { token: opts.token } } : {}),
    ...(opts.cookie !== undefined ? { extraHeaders: { cookie: opts.cookie } } : {}),
  });
  sockets.push(sock);
  return sock;
}

async function startLobbyServer(): Promise<ServerContext> {
  const app = buildApp();
  app.log.level = 'silent';
  const io = new Server(app.server, { cors: { origin: config.corsOrigins, credentials: true } });
  attachSocketServer(app, io);
  await app.ready();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return { app, io, port };
}

async function stopLobbyServer(ctx: ServerContext): Promise<void> {
  for (const socket of sockets) {
    socket.removeAllListeners();
    socket.close();
  }
  sockets.length = 0;
  await ctx.io.close();
  await ctx.app.close();
}

test('socket connections without credentials are rejected', async () => {
  const ctx = await startLobbyServer();
  try {
    const s = makeClient(ctx.port);
    const [err] = await once(s, 'connect_error');
    assert.equal(err.message, 'unauthorized');
    assert.equal(s.connected, false);
  } finally {
    await stopLobbyServer(ctx);
  }
});

test('socket connections with a tampered token are rejected', async () => {
  const ctx = await startLobbyServer();
  try {
    const token = signToken(ctx.app, { sub: ADMIN_USER_ID, username: 'admin', role: Role.ADMIN });
    const tampered = `${token.slice(0, -2)}xx`;
    const s = makeClient(ctx.port, { token: tampered });
    const [err] = await once(s, 'connect_error');
    assert.equal(err.message, 'unauthorized');
  } finally {
    await stopLobbyServer(ctx);
  }
});

test('socket connections with non-staff role tokens are forbidden', async () => {
  const ctx = await startLobbyServer();
  try {
    const forged = signToken(ctx.app, {
      sub: ADMIN_USER_ID,
      username: 'bot',
      role: 'BOT' as Role,
    });
    const s = makeClient(ctx.port, { token: forged });
    const [err] = await once(s, 'connect_error');
    assert.equal(err.message, 'forbidden');
  } finally {
    await stopLobbyServer(ctx);
  }
});

test('authenticated admin can join the lobby over handshake auth', async () => {
  const ctx = await startLobbyServer();
  try {
    const token = signToken(ctx.app, { sub: ADMIN_USER_ID, username: 'admin', role: Role.ADMIN });
    const s = makeClient(ctx.port, { token });
    await once(s, 'connect');
    s.emit('join:lobby');
    const [joined] = await once(s, 'lobby:joined');
    // A tenant user lands in their own center's room, not the shared one.
    assert.equal(joined.room, `tenant:${TEST_TENANT_ID}:lobby`);

    s.emit('leave:lobby');
    const [left] = await once(s, 'lobby:left');
    assert.equal(left.room, `tenant:${TEST_TENANT_ID}:lobby`);
  } finally {
    await stopLobbyServer(ctx);
  }
});

test('a user with no tenant falls back to the shared lobby room', async () => {
  const ctx = await startLobbyServer();
  try {
    const token = signToken(ctx.app, { sub: ADMIN_USER_ID, username: 'admin', role: Role.ADMIN, tenantId: null });
    const s = makeClient(ctx.port, { token });
    await once(s, 'connect');
    s.emit('join:lobby');
    const [joined] = await once(s, 'lobby:joined');
    assert.equal(joined.room, 'center:lobby');
  } finally {
    await stopLobbyServer(ctx);
  }
});

test('authenticated receptionist can join the lobby via the signed access_token cookie', async () => {
  const ctx = await startLobbyServer();
  try {
    const token = signToken(ctx.app, { sub: RECEPTIONIST_USER_ID, username: 'reception1', role: Role.RECEPTIONIST });
    const signed = signCookieValue(token, config.cookieSecret);
    const s = makeClient(ctx.port, { cookie: `access_token=${signed}` });
    await once(s, 'connect');
    s.emit('join:lobby');
    const [joined] = await once(s, 'lobby:joined');
    assert.equal(joined.room, `tenant:${TEST_TENANT_ID}:lobby`);
  } finally {
    await stopLobbyServer(ctx);
  }
});

test('two authenticated desks both receive attendance broadcasts', async () => {
  const ctx = await startLobbyServer();
  try {
    const adminToken = signToken(ctx.app, { sub: ADMIN_USER_ID, username: 'admin', role: Role.ADMIN });
    const receptionToken = signToken(ctx.app, { sub: RECEPTIONIST_USER_ID, username: 'reception1', role: Role.RECEPTIONIST });

    const s1 = makeClient(ctx.port, { token: adminToken });
    const s2 = makeClient(ctx.port, { token: receptionToken });
    await once(s1, 'connect');
    await once(s2, 'connect');
    s1.emit('join:lobby');
    s2.emit('join:lobby');
    await once(s1, 'lobby:joined');
    await once(s2, 'lobby:joined');

    const payload = {
      sessionId: 'session-1',
      studentId: 'student-1',
      studentName: 'يوسف أحمد',
      deskIdentifier: 'Desk 1',
      paymentMethod: 'CASH',
      newLobbyCount: 7,
      timestamp: '2026-09-04T12:00:00.000Z',
    };

    const received = Promise.all([once(s1, 'attendance:checked_in'), once(s2, 'attendance:checked_in')]);
    ctx.io.to('center:lobby').emit('attendance:checked_in', payload);
    const [[event1], [event2]] = await received;

    assert.deepEqual(event1, payload);
    assert.deepEqual(event2, payload);
  } finally {
    await stopLobbyServer(ctx);
  }
});

test('leave:lobby stops receiving broadcasts', async () => {
  const ctx = await startLobbyServer();
  try {
    const token = signToken(ctx.app, { sub: RECEPTIONIST_USER_ID, username: 'reception1', role: Role.RECEPTIONIST });
    const s = makeClient(ctx.port, { token });
    await once(s, 'connect');
    s.emit('join:lobby');
    await once(s, 'lobby:joined');
    s.emit('leave:lobby');
    await once(s, 'lobby:left');

    ctx.io.to('center:lobby').emit('attendance:checked_in', { sessionId: 's', studentId: 'st', studentName: 'n', deskIdentifier: 'd', paymentMethod: 'CASH', newLobbyCount: 1, timestamp: new Date().toISOString() });

    const received = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 350);
      s.on('attendance:checked_in', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });
    assert.equal(received, false);
  } finally {
    await stopLobbyServer(ctx);
  }
});