import { buildApp } from '../src/server/app.js';
import type { FastifyInstance } from 'fastify';
import { Role } from '../src/shared/constants/index.js';
import {
  addEgyptDays,
  setLifecycleResolverForTests,
  type TenantLifecycle,
} from '../src/server/lib/tenantLifecycle.js';

// ─── Shared helpers for the Prompt 5 test suite ────────────────────────────
// These tests run WITHOUT a live PostgreSQL. They exercise:
//   1. Pure business/domain functions exported from the Fastify modules
//      (financial math, validation, state transitions, pagination).
//   2. HTTP guards (auth 401 / RBAC 403 / schema-validation 400 / error
//      envelopes) via fastify.inject(), which short-circuit before any DB
//      access.
// The DB-dependent end-to-end suite lives in tests/integration/db/*.test.ts
// and is skipped unless TEST_DATABASE_URL is provided.

export const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validUUID(seed: string): string {
  // Deterministic, spec-compliant v4 UUIDs from a seed hex string.
  const hex = seed.replace(/[^0-9a-f]/gi, '').padEnd(32, '0').slice(0, 32);
  const a = hex.slice(0, 8);
  const b = hex.slice(8, 12);
  const c = hex.slice(12, 16);
  const cAdj = `4${c.slice(1)}`;
  const d = hex.slice(16, 20);
  const dAdj = `${'89ab'[Number(d[0]) % 4]}${d.slice(1)}`;
  const e = hex.slice(20, 32);
  return `${a}-${b}-${cAdj}-${dAdj}-${e}`.toLowerCase();
}

export const ADMIN_USER_ID = validUUID('aaaaaaaa-0000-0000-0000-000000000001');
export const RECEPTIONIST_USER_ID = validUUID('bbbbbbbb-0000-0000-0000-000000000002');
export const OTHER_RECEPTIONIST_ID = validUUID('cccccccc-0000-0000-0000-000000000003');

export type TestAuth = { token: string };

export async function createTestApp(options?: { silent?: boolean }): Promise<FastifyInstance> {
  // These tests never touch a real database, so the tenant lifecycle the write
  // guard would otherwise read is stubbed to a fully paid, ACTIVE center. That
  // keeps the suite focused on the auth / RBAC / schema guard layer, and keeps
  // the lifecycle decision itself covered by the pure unit tests plus the
  // dedicated lifecycle HTTP tests, which install their own resolver.
  setLifecycleResolverForTests(async () => activeLifecycle());
  const app = buildApp();
  await app.ready();
  if (options?.silent !== false) {
    app.log.level = 'silent';
  }
  return app;
}

/** A center that has paid and is inside its period: writes are allowed. */
export function activeLifecycle(): TenantLifecycle {
  const now = new Date();
  return {
    state: 'ACTIVE',
    canWrite: true,
    readOnly: false,
    activePeriodStart: now.toISOString(),
    activePeriodEnd: addEgyptDays(now, 30).toISOString(),
    daysUntilExpiry: 30,
    freezesAt: addEgyptDays(now, 38).toISOString(),
    reminder: null,
  };
}

/**
 * Every tenant user token carries a `tenantId`, exactly as the real login route
 * mints them (see auth.ts). The lifecycle guard fails closed when the claim is
 * missing, so a token without one would be rejected before the route handler
 * and would make the guard-layer tests pass for the wrong reason.
 */
export const TEST_TENANT_ID = validUUID('eeeeeeee-0000-0000-0000-000000000005');
export const OTHER_TENANT_ID = validUUID('ffffffff-0000-0000-0000-000000000006');

export function signToken(
  app: FastifyInstance,
  opts: { sub: string; username: string; role: Role; expiresIn?: string; tenantId?: string | null },
): string {
  const tenantId = opts.tenantId === undefined ? TEST_TENANT_ID : opts.tenantId;
  return app.jwt.sign(
    { sub: opts.sub, username: opts.username, role: opts.role, tenantId },
    { expiresIn: opts.expiresIn ?? '1h' },
  );
}

export function adminAuth(app: FastifyInstance): TestAuth {
  return { token: signToken(app, { sub: ADMIN_USER_ID, username: 'admin', role: Role.ADMIN }) };
}

export function receptionistAuth(app: FastifyInstance): TestAuth {
  return { token: signToken(app, { sub: RECEPTIONIST_USER_ID, username: 'reception1', role: Role.RECEPTIONIST }) };
}

export function superAdminAuth(app: FastifyInstance): TestAuth {
  // A super admin is not tied to a single center, so their token carries no
  // tenantId — which is why superadmin routes must never use the tenant guard.
  return { token: signToken(app, { sub: validUUID('dddddddd-0000-0000-0000-000000000004'), username: 'superadmin', role: Role.SUPER_ADMIN, tenantId: null }) };
}

export function tokens(app: FastifyInstance) {
  return {
    admin: adminAuth(app).token,
    receptionist: receptionistAuth(app).token,
    otherReceptionist: signToken(app, { sub: OTHER_RECEPTIONIST_ID, username: 'reception2', role: Role.RECEPTIONIST }),
  };
}

export function authHeaders(token: string): { authorization: string } {
  return { authorization: `Bearer ${token}` };
}

/** Disable the app request logger for a quiet test run. */
export function silenceApp(app: FastifyInstance): void {
  app.log.level = 'silent';
}

export function envelopeOk(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as { success?: boolean };
    return parsed.success === true;
  } catch {
    return false;
  }
}

export function errorCode(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { error?: { code?: string } };
    return parsed.error?.code;
  } catch {
    return undefined;
  }
}