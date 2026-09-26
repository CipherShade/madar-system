import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Structural guard for the tenant write gate.
 *
 * The real enforcement is requireTenantWritable, but the test suite has no
 * database, so a route that simply forgot the guard could not otherwise be
 * caught. These assertions read the route sources and prove the invariant:
 * every tenant business write is gated, and the routes that must stay reachable
 * while a center cannot write are not.
 *
 * A new write route added without the guard fails here.
 */

const MODULES = join(process.cwd(), 'src', 'server', 'modules');

function routeFiles(dir = MODULES): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return routeFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

/**
 * Every `app.<method>(` declaration, captured up to its `async` handler.
 *
 * The handler keyword is the anchor on purpose: matching to a bare `{` would
 * stop at the generic type parameter (`app.post<{ Body: X }>`) and capture
 * nothing useful, which previously made this whole file pass vacuously.
 *
 * The window is generous because some routes carry a large inline JSON Schema
 * between the declaration and the handler; too small a window silently hides
 * those routes from the guard check.
 *
 * The "don't cross into another route" guard must key on a new *declaration*,
 * not on any `app.`: preHandler arrays legitimately contain `app.rateLimit.*`,
 * and treating those as a boundary hid every rate-limited route from the check.
 */
function writeDeclarations(source: string) {
  const out: Array<{ method: string; body: string }> = [];
  const pattern = /app\.(post|patch|put|delete)(?:(?!\s*app\.(?:get|post|patch|put|delete)\b)[\s\S]){0,3000}?async\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    out.push({ method: match[1], body: match[0] });
  }
  return out;
}

/** Routes that must stay reachable even when the tenant cannot write. */
const EXEMPT_FILES = [
  'auth.ts', // login, logout, register-center, change-password
  'subscriptions.ts', // upgrade/pay, current, verify, reject
  'admin.ts', // SUPER_ADMIN_GATE
  'platformOps.ts',
  'platformBilling.ts',
  'platformUsers.ts',
];

const files = routeFiles();

describe('WRITE GUARD COVERAGE: every tenant business write is gated', () => {
  test('the route files were discovered', () => {
    assert.ok(files.length >= 10, `only found ${files.length} route files`);
  });

  test('the scanner actually finds the tenant writes it is meant to police', () => {
    // Guards against this file passing vacuously: if the declaration regex ever
    // breaks again, the "no missing guard" test below would pass for free.
    const writes: string[] = [];
    for (const file of files) {
      const name = file.split(/[\\/]/).pop()!;
      if (EXEMPT_FILES.includes(name)) continue;
      for (const { body } of writeDeclarations(readFileSync(file, 'utf8'))) {
        if (body.includes('preHandler: [')) writes.push(name);
      }
    }
    assert.ok(writes.length >= 22, `scanner found only ${writes.length} tenant writes, expected >= 22`);
  });

  test('no tenant write route is missing requireTenantWritable', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const name = file.split(/[\\/]/).pop()!;
      if (EXEMPT_FILES.includes(name)) continue;
      for (const { method, body } of writeDeclarations(readFileSync(file, 'utf8'))) {
        if (!body.includes('preHandler: [')) continue; // no auth gate at all -> not a tenant route
        if (!body.includes('requireTenantWritable')) {
          offenders.push(`${name} app.${method}`);
        }
      }
    }
    assert.deepEqual(offenders, [], `unguarded tenant writes: ${offenders.join(', ')}`);
  });

  test('the guard always runs after authenticate, never before', () => {
    const wrongOrder: string[] = [];
    for (const file of files) {
      const name = file.split(/[\\/]/).pop()!;
      if (EXEMPT_FILES.includes(name)) continue;
      for (const { method, body } of writeDeclarations(readFileSync(file, 'utf8'))) {
        const at = body.indexOf('requireTenantWritable');
        if (at === -1) continue;
        const auth = body.indexOf('authenticate');
        if (auth === -1 || auth > at) wrongOrder.push(`${name} app.${method}`);
      }
    }
    assert.deepEqual(wrongOrder, [], `guard before authenticate: ${wrongOrder.join(', ')}`);
  });

  test('read routes are never gated, so a frozen center can still read', () => {
    const offenders: string[] = [];
    let scanned = 0;
    for (const file of files) {
      const name = file.split(/[\\/]/).pop()!;
      const source = readFileSync(file, 'utf8');
      const pattern = /app\.get(?:(?!\s*app\.(?:get|post|patch|put|delete)\b)[\s\S]){0,3000}?async\s*\(/g;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(source)) !== null) {
        scanned += 1;
        if (match[0].includes('requireTenantWritable')) offenders.push(`${name} app.get`);
      }
    }
    assert.ok(scanned >= 20, `scanner found only ${scanned} read routes, expected >= 20`);
    assert.deepEqual(offenders, [], `gated read routes: ${offenders.join(', ')}`);
  });
});

describe('WRITE GUARD EXEMPTIONS: a blocked center can still pay and manage itself', () => {
  const read = (rel: string) => readFileSync(join(MODULES, ...rel.split('/')), 'utf8');

  test('login, logout, register-center and change-password stay open', () => {
    const src = read('auth/auth.ts');
    assert.ok(!src.includes('requireTenantWritable'), 'auth routes must never be gated');
  });

  test('the upgrade/pay endpoint stays open — a frozen center must be able to pay', () => {
    const src = read('subscriptions/subscriptions.ts');
    assert.ok(!src.includes('requireTenantWritable'), 'paying must never require write access');
    assert.match(src, /app\.post<\{ Body: UpgradeBody \}>\('\/upgrade'/, 'the upgrade route moved');
  });

  test('no superadmin route is gated, so the owner can always approve or unblock', () => {
    for (const name of ['admin.ts', 'platformOps.ts', 'platformBilling.ts', 'platformUsers.ts']) {
      const src = read(`admin/${name}`);
      assert.ok(!src.includes('requireTenantWritable'), `${name} must stay ungated`);
    }
  });

  test('verification and rejection stay open so approval always works', () => {
    const src = read('subscriptions/subscriptions.ts');
    assert.match(src, /'\/:id\/verify'/, 'verify route moved');
    assert.match(src, /'\/:id\/reject'/, 'reject route moved');
    assert.ok(!src.includes('requireTenantWritable'));
  });
});
