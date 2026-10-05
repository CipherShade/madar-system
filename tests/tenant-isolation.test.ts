import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tenant isolation, at the source-shape level.
 *
 * A tenant business row belongs to exactly one center. `PATCH /api/branches/:id`
 * used to look the row up by `id` alone, which made an unguessable UUID the only
 * thing standing between two centers' data. Any admin who learned another
 * center's branch id — from a shared screenshot, a support ticket, or a leaked
 * export — could rename or delete it, and the same shape was repeated across the
 * registry, the schedule, the lobby, the shift register and the reports.
 *
 * The runtime fix is `where: { id, tenantId }` (Prisma's ExtendedWhereUnique) for
 * writes and `where: { id, tenantId }` on `findFirst` for reads, so a foreign row
 * simply does not match and the existing P2025 → 404 mapping hides its existence.
 *
 * These assertions pin that shape, because the failure mode is silent: dropping
 * `tenantId` again compiles, passes review, and reopens the hole with nothing
 * failing at runtime until it is exploited.
 *
 * Two rules are enforced, and they are the two halves of the same hole:
 *   1. a tenant-facing route never looks a row up by a request param alone;
 *   2. a tenant-facing route never drops the tenant filter when the claim is
 *      missing, because `undefined` is dropped by Prisma and "any tenant" looks
 *      exactly like "the right tenant" until a row from another center answers.
 *
 * Rule 1's exception is the product rule itself: a SUPER_ADMIN-only route may
 * act on any center's row, because approving a subscription or reviewing a
 * center is inherently platform-wide. That is expressed as a role check rather
 * than a list of files, so a new platform route is allowed for the right reason
 * and a tenant route cannot buy the exception by being added to a list.
 *
 * The HTTP-level counterpart — that a tenant-less token is actually refused —
 * is `tests/tenant-fail-closed.test.ts`. Real two-tenant database behaviour is
 * `tests/integration/db/tenant-isolation.test.ts`.
 */

const MODULES = join(process.cwd(), 'src', 'server', 'modules');

/** Super-admin console modules that legitimately operate across tenants. */
const CROSS_TENANT_MODULES = new Set([
  'admin.ts',
  'platformOps.ts',
  'platformBilling.ts',
  'platformUsers.ts',
  'auth.ts',
]);

/**
 * A lookup keyed on a request param and nothing else: the shape that turned an
 * id into a cross-tenant read or write.
 */
const ID_ONLY_LOOKUP = /where:\s*\{[^{}]*\bid:\s*request\.(?:params|query)\.[A-Za-z]+[^{}]*\}/g;

const TENANT_BUSINESS_MODELS = [
  'branch',
  'room',
  'teacher',
  'student',
  'session',
  'attendance',
  'user',
  'product',
  'branchStock',
  'stockMovement',
  'bookSale',
  'shiftRegister',
];

function routeFiles(dir = MODULES): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/**
 * Every route's declaration *and its whole handler*, bounded by the next route.
 *
 * The handler has to be included. An id-only lookup lives inside the handler
 * body, so a scanner that stops at `async (` sees only the preHandler chain and
 * passes vacuously — which is exactly the kind of test that makes a codebase
 * feel covered while nothing is checked.
 */
function routeDeclarations(source: string): Array<{ method: string; body: string }> {
  const starts: Array<{ method: string; index: number }> = [];
  const pattern = /app\.(get|post|patch|put|delete)\b/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    starts.push({ method: match[1], index: match.index });
  }
  return starts.map((entry, position) => ({
    method: entry.method,
    body: source.slice(entry.index, starts[position + 1]?.index ?? source.length),
  }));
}

const files = routeFiles();

/**
 * A route that only a super admin can reach. Deliberately requires the
 * super-admin gate to appear without ADMIN: `requireRoles(Role.ADMIN,
 * Role.SUPER_ADMIN)` reaches tenant routes too and must not earn the cross-tenant
 * exception. Both spellings the codebase uses are accepted, because the rule is
 * about who can reach the route, not about which guard expresses it.
 */
function isSuperAdminOnly(body: string): boolean {
  const superAdminGate = body.includes('requireRoles(Role.SUPER_ADMIN)') || body.includes('SUPER_ADMIN_GATE');
  return superAdminGate && !body.includes('Role.ADMIN');
}

describe('TENANT ISOLATION: branch mutations are scoped to the center', () => {
  test('the branch route module was discovered', () => {
    assert.ok(
      files.some((file) => file.endsWith('branches.ts')),
      'branches.ts should be among the discovered route modules',
    );
  });

  test('no branch update or delete targets a row by id alone', () => {
    const source = readFileSync(join(MODULES, 'management', 'branches.ts'), 'utf8');

    // Every `branch.update` / `branch.delete` must carry tenantId in its where.
    const unscoped = [...source.matchAll(/branch\.(update|delete)\(\{([\s\S]{0,200}?)\}\)/g)].filter(
      ([, , args]) => !args.includes('tenantId'),
    );

    assert.deepEqual(
      unscoped.map((m) => m[0].slice(0, 60)),
      [],
      'branch mutations must be scoped by tenantId as well as id',
    );
  });

  test('the mutation handlers refuse a request with no tenant instead of skipping the scope', () => {
    const source = readFileSync(join(MODULES, 'management', 'branches.ts'), 'utf8');
    // With tenantId undefined, `where: { id, tenantId }` silently degrades to
    // "any tenant" — Prisma drops undefined from the filter. Both mutating
    // handlers must therefore fail closed with TENANT_REQUIRED.
    const required = [...source.matchAll(/TENANT_REQUIRED/g)];
    assert.ok(required.length >= 2, 'PATCH and DELETE must both guard on a missing tenantId');
  });

  test('the branch module keeps its write guard and role restriction', () => {
    const source = readFileSync(join(MODULES, 'management', 'branches.ts'), 'utf8');
    const writes = routeDeclarations(source).filter(({ method }) => method !== 'get');

    assert.ok(writes.length >= 3, `expected at least 3 branch writes, found ${writes.length}`);
    for (const { method, body } of writes) {
      assert.ok(body.includes('authenticate'), `branch ${method} must authenticate`);
      assert.ok(body.includes('requireRoles(Role.ADMIN)'), `branch ${method} must be ADMIN-only`);
      assert.ok(body.includes('requireTenantWritable'), `branch ${method} must respect the tenant write guard`);
    }
  });
});

describe('TENANT ISOLATION: the audited debt is paid, not retired quietly', () => {
  /**
   * Every module below used to carry id-only lookups on tenant business rows.
   * They are listed so the audit's findings stay legible: a module that appears
   * here and then regresses is named in the failure, instead of the list
   * quietly emptying itself the next time somebody "tidies up" the tests.
   *
   * Nothing may be added back. A genuinely new id-only lookup is a security bug
   * to fix, not debt to file — so the correct response to a failure in the tests
   * below is to scope the query, never to append an entry.
   */
  const RESOLVED_DEBT = [
    { module: 'management.ts', routes: 'rooms/:id, teachers/:id' },
    { module: 'scheduling.ts', routes: 'sessions, sessions/:id, conflict lookups' },
    { module: 'students.ts', routes: 'students/:id, students/:id/attendances' },
    { module: 'attendances.ts', routes: 'sessions/active, checkin, sessions/:sessionId/attendances, void' },
    { module: 'reconciliation.ts', routes: 'sessions/:id/reconcile' },
    { module: 'settlements.ts', routes: 'sessions/:id/settle' },
    { module: 'reports.ts', routes: 'daily, shifts/:shiftId/audit' },
    { module: 'users.ts', routes: 'GET /, users/:id' },
    { module: 'shifts.ts', routes: 'current, history, open, close, expenses' },
  ];

  test('every audited module still exists, so the list cannot rot', () => {
    const known = new Set(files.map((file) => file.split(/[\\/]/).pop()!));
    const missing = RESOLVED_DEBT.map((entry) => entry.module).filter((module) => !known.has(module));
    assert.deepEqual(missing, [], `audited modules no longer on disk: ${missing.join(', ')}`);
  });

  test('every audited module is now free of id-only tenant writes', () => {
    for (const { module, routes } of RESOLVED_DEBT) {
      const file = files.find((candidate) => candidate.endsWith(module));
      assert.ok(file, `${module} (${routes}) is no longer on disk`);

      const source = readFileSync(file, 'utf8');
      const unscoped = [...source.matchAll(/(\w+)\.(update|delete)\(\{([\s\S]{0,200}?)\}\)/g)].filter(
        ([, model, method, args]) =>
          TENANT_BUSINESS_MODELS.includes(model) && method && args && !args.includes('tenantId'),
      );
      assert.deepEqual(
        unscoped.map((match) => match[0].slice(0, 70)),
        [],
        `${module} (${routes}) regressed to an id-only ${unscoped.length ? unscoped[0]?.[1] : 'write'}`,
      );
    }
  });
});

describe('TENANT ISOLATION: no tenant-facing route reads a row by id alone', () => {
  test('a request param is never the whole lookup', () => {
    // The write-side rule is checked above. This is the read side, which is the
    // half that leaks silently: a foreign row simply renders instead of failing,
    // so nothing 500s, nothing logs, and nobody notices until a customer does.
    const offenders: string[] = [];

    for (const file of files) {
      const name = file.split(/[\\/]/).pop()!;
      if (CROSS_TENANT_MODULES.has(name)) continue;

      const source = readFileSync(file, 'utf8');
      for (const { method, body } of routeDeclarations(source)) {
        if (isSuperAdminOnly(body)) continue;
        for (const match of body.matchAll(ID_ONLY_LOOKUP)) {
          if (match[0].includes('tenantId')) continue;
          offenders.push(`${name} ${method.toUpperCase()} ${match[0].replace(/\s+/g, ' ')}`);
        }
      }
    }

    assert.deepEqual(
      offenders,
      [],
      'these routes look a row up by request param with no tenant filter. Scope them by tenantId, ' +
        'or make the route SUPER_ADMIN-only if it genuinely operates across centers.',
    );
  });

  test('the super-admin exception is still reachable, so the rule above cannot be satisfied by disabling routes', () => {
    // A guard that passes because the route was deleted proves nothing. This
    // confirms the platform console that legitimately crosses tenants is intact.
    const source = readFileSync(join(MODULES, 'admin', 'platformBilling.ts'), 'utf8');
    const routes = routeDeclarations(source);
    assert.ok(routes.length > 0, 'platformBilling.ts should still declare routes');
    assert.ok(
      routes.some((route) => isSuperAdminOnly(route.body)),
      'platform billing must keep at least one SUPER_ADMIN-only route',
    );
  });

  test('the id-only platform subscription routes are SUPER_ADMIN-only, not tenant routes', () => {
    // subscriptions.ts keeps `findUnique({ where: { id } })` on purpose: approving
    // or rejecting a subscription means acting on a center that does not have a
    // usable account yet, so there is no tenant to scope by. That is only safe
    // while the route is unreachable to a center admin.
    const source = readFileSync(join(MODULES, 'subscriptions', 'subscriptions.ts'), 'utf8');
    const crossTenant = routeDeclarations(source).filter(({ body }) => body.match(ID_ONLY_LOOKUP));

    assert.ok(crossTenant.length > 0, 'subscriptions.ts should still have id-only lookups to police');
    for (const route of crossTenant) {
      assert.ok(
        isSuperAdminOnly(route.body),
        `a subscriptions.ts route looks a subscription up by id alone and is not SUPER_ADMIN-only: ${route.body.slice(0, 120)}`,
      );
    }
  });
});

