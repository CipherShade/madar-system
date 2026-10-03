import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tenant isolation for branch mutations.
 *
 * A branch belongs to exactly one center. `PATCH`/`DELETE /api/branches/:id`
 * used to look the row up by `id` alone, which made an unguessable UUID the only
 * thing standing between two centers' data. Any admin who learned another
 * center's branch id — from a shared screenshot, a support ticket, or a leaked
 * export — could rename or delete it.
 *
 * The runtime fix is `where: { id, tenantId }` (Prisma's ExtendedWhereUnique), so
 * a foreign row simply does not match and the existing P2025 → 404 mapping hides
 * its existence. These assertions pin that shape, because the failure mode is
 * silent: removing `tenantId` again compiles, passes review, and reopens the hole.
 */

const MODULES = join(process.cwd(), 'src', 'server', 'modules');

/** Super-admin console modules legitimately operate across tenants. */
const CROSS_TENANT_MODULES = new Set([
  'admin.ts',
  'platformOps.ts',
  'platformBilling.ts',
  'platformUsers.ts',
  'auth.ts',
]);

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

/** `app.<method>(` up to its `async` handler, without crossing into another route. */
function routeDeclarations(source: string) {
  const out: Array<{ method: string; body: string }> = [];
  const pattern = /app\.(get|post|patch|put|delete)(?:(?!\s*app\.(?:get|post|patch|put|delete)\b)[\s\S]){0,3000}?async\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) out.push({ method: match[1], body: match[0] });
  return out;
}

const files = routeFiles();

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

describe('TENANT ISOLATION: known debt is tracked, not forgotten', () => {
  /**
   * These modules still carry id-only lookups on tenant business rows. They are
   * listed so the debt is visible and this file fails when one is fixed — at
   * which point the entry should be deleted, not the test relaxed.
   */
  const KNOWN_UNSCOPED = new Map<string, string[]>([
    ['management.ts', ['rooms/:id', 'teachers/:id']],
    ['scheduling.ts', ['sessions', 'sessions/:id']],
    ['students.ts', ['students/:id']],
    ['attendances.ts', ['sessions/active', 'checkin', 'sessions/:sessionId/attendances', 'void']],
    ['reconciliation.ts', ['sessions/:id/reconcile']],
    ['settlements.ts', ['sessions/:id/settle']],
    ['reports.ts', ['daily', 'shifts/:shiftId/audit']],
    ['users.ts', ['GET /', 'users/:id']],
    ['shifts.ts', ['history']],
  ]);

  test('every tenant route module is either clean or listed as known debt', () => {
    const unlisted: string[] = [];
    for (const file of files) {
      const name = file.split(/[\\/]/).pop()!;
      if (CROSS_TENANT_MODULES.has(name)) continue;

      const source = readFileSync(file, 'utf8');
      const hits = routeDeclarations(source).filter(({ body }) =>
        TENANT_BUSINESS_MODELS.some(
          (model) =>
            new RegExp(`\\b${model}\\.(update|delete)\\(`, 'i').test(body) &&
            !/where:\s*\{[^}]*tenantId/.test(body),
        ),
      );
      if (hits.length > 0 && !KNOWN_UNSCOPED.has(name)) unlisted.push(name);
    }
    assert.deepEqual(unlisted, [], `unscoped tenant writes in modules not tracked as debt: ${unlisted.join(', ')}`);
  });

  test('the new inventory module carries no unscoped tenant writes', () => {
    // The add-on routes were written after the audit, so they must not appear on
    // the debt list at all.
    assert.equal(KNOWN_UNSCOPED.has('inventory.ts'), false);
  });
});
