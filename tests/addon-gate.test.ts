import test, { describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestApp, adminAuth, receptionistAuth, superAdminAuth, authHeaders, errorCode, validUUID } from './helpers.js';
import { setAddonReaderForTests, isKnownAddon, loadEnabledAddons, isAddonEnabled, ADDON_MESSAGES } from '../src/server/lib/addons.js';
import { BOOKS_INVENTORY_ADDON } from '../src/shared/constants/subscription.js';

/**
 * The Books & Inventory add-on gate.
 *
 * A center that has not paid for the add-on must get 403 ADDON_NOT_ENABLED from
 * every inventory route — reads included. An inventory screen handed out for
 * free is not a trial, it is a missing paywall.
 *
 * The unit suite has no database, so the entitlement reader is replaced through
 * setAddonReaderForTests. That is the same seam the lifecycle guard uses.
 */

const INVENTORY_ROUTES: Array<{ method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; url: string; body?: unknown }> = [
  { method: 'GET', url: '/api/inventory/products' },
  { method: 'GET', url: '/api/inventory/sales' },
  { method: 'GET', url: '/api/inventory/movements' },
  { method: 'GET', url: '/api/inventory/reports' },
  { method: 'GET', url: `/api/inventory/students/${validUUID('stu')}/purchases` },
  {
    method: 'POST',
    url: '/api/inventory/products',
    body: { nameAr: 'كتاب', salePrice: 50 },
  },
  {
    method: 'POST',
    url: '/api/inventory/purchases',
    body: { branchId: validUUID('br'), items: [{ productId: validUUID('pr'), quantity: 5, unitCost: 20 }] },
  },
  {
    method: 'POST',
    url: '/api/inventory/adjustments',
    body: { branchId: validUUID('br'), productId: validUUID('pr'), countedQuantity: 4 },
  },
  {
    method: 'POST',
    url: '/api/inventory/write-offs',
    body: { branchId: validUUID('br'), productId: validUUID('pr'), quantity: 1 },
  },
  {
    method: 'POST',
    url: '/api/inventory/sales',
    body: {
      branchId: validUUID('br'),
      studentId: validUUID('stu'),
      paymentMethod: 'CASH',
      items: [{ productId: validUUID('pr'), quantity: 1 }],
    },
  },
  { method: 'POST', url: `/api/inventory/sales/${validUUID('sal')}/void`, body: { reason: 'خطأ' } },
];

afterEach(() => setAddonReaderForTests(null));

describe('ADD-ON ENTITLEMENT LOOKUP', () => {
  test('a center with no add-on row has nothing enabled', async () => {
    setAddonReaderForTests(async () => []);
    assert.deepEqual(await loadEnabledAddons('tenant-1'), []);
    assert.equal(await isAddonEnabled('tenant-1', BOOKS_INVENTORY_ADDON), false);
  });

  test('an enabled add-on is reported for that center only', async () => {
    setAddonReaderForTests(async (tenantId) => (tenantId === 'tenant-1' ? [BOOKS_INVENTORY_ADDON] : []));
    assert.equal(await isAddonEnabled('tenant-1', BOOKS_INVENTORY_ADDON), true);
    assert.equal(await isAddonEnabled('tenant-2', BOOKS_INVENTORY_ADDON), false);
  });

  test('a code from an unknown catalog version is ignored, not honoured', async () => {
    // A retired or future code must never grant a capability this build cannot
    // price or support.
    setAddonReaderForTests(async () => ['SOMETHING_ELSE', BOOKS_INVENTORY_ADDON]);
    assert.deepEqual(await loadEnabledAddons('tenant-1'), [BOOKS_INVENTORY_ADDON]);
    assert.equal(isKnownAddon('SOMETHING_ELSE'), false);
    assert.equal(isKnownAddon(BOOKS_INVENTORY_ADDON), true);
  });

  test('both languages have a message for every sellable add-on', () => {
    for (const code of [BOOKS_INVENTORY_ADDON]) {
      assert.ok(ADDON_MESSAGES[code].messageAr.length > 0);
      assert.ok(ADDON_MESSAGES[code].messageEn.length > 0);
    }
  });
});

describe('ADD-ON GATE via HTTP (no DB required)', () => {
  test('a center without the add-on is refused on every inventory route', async () => {
    setAddonReaderForTests(async () => []);
    const app = await createTestApp({ silent: true });
    const auth = adminAuth(app);

    for (const route of INVENTORY_ROUTES) {
      const res = await app.inject({
        method: route.method,
        url: route.url,
        headers: authHeaders(auth.token),
        ...(route.body ? { payload: route.body as object } : {}),
      });
      assert.equal(res.statusCode, 403, `${route.method} ${route.url} should be gated`);
      assert.equal(errorCode(res.body), 'ADDON_NOT_ENABLED', `${route.method} ${route.url}`);
    }

    await app.close();
  });

  test('an unauthenticated request is rejected before the add-on is consulted', async () => {
    setAddonReaderForTests(async () => [BOOKS_INVENTORY_ADDON]);
    const app = await createTestApp({ silent: true });

    const res = await app.inject({ method: 'GET', url: '/api/inventory/products' });
    assert.equal(res.statusCode, 401);
    assert.equal(errorCode(res.body), 'UNAUTHORIZED');

    await app.close();
  });

  test('a receptionist is refused by the add-on gate, not by a role check', async () => {
    // Receptionists are the ones who ring up sales, so the add-on must be what
    // stops them when it is off — not an incidental ADMIN-only restriction.
    setAddonReaderForTests(async () => []);
    const app = await createTestApp({ silent: true });
    const auth = receptionistAuth(app);

    const res = await app.inject({
      method: 'POST',
      url: '/api/inventory/sales',
      headers: authHeaders(auth.token),
      payload: {
        branchId: validUUID('br'),
        studentId: validUUID('stu'),
        paymentMethod: 'CASH',
        items: [{ productId: validUUID('pr'), quantity: 1 }],
      },
    });

    assert.equal(res.statusCode, 403);
    assert.equal(errorCode(res.body), 'ADDON_NOT_ENABLED');
    await app.close();
  });

  test('a token with no tenant gets TENANT_CONTEXT_MISSING, never a free feature', async () => {
    setAddonReaderForTests(async () => [BOOKS_INVENTORY_ADDON]);
    const app = await createTestApp({ silent: true });

    // Super admin belongs to no single center, so the add-on gate must fail
    // closed rather than treating "no tenant" as "everything enabled".
    const res = await app.inject({
      method: 'GET',
      url: '/api/inventory/products',
      headers: authHeaders(superAdminAuth(app).token),
    });

    assert.equal(res.statusCode, 403);
    assert.equal(errorCode(res.body), 'TENANT_CONTEXT_MISSING');
    await app.close();
  });

  test('the gate reports the add-on that is missing so the client can upsell', async () => {
    setAddonReaderForTests(async () => []);
    const app = await createTestApp({ silent: true });
    const auth = adminAuth(app);

    const res = await app.inject({ method: 'GET', url: '/api/inventory/products', headers: authHeaders(auth.token) });
    const body = JSON.parse(res.body);

    assert.equal(body.error.details.addon, BOOKS_INVENTORY_ADDON);
    await app.close();
  });
});

describe('ADD-ON GATE: structural coverage', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'server', 'modules', 'inventory', 'inventory.ts'), 'utf8');

  test('the inventory module was found', () => {
    assert.ok(source.includes('inventoryRoutes'), 'inventory.ts should export a route plugin');
  });

  test('every inventory route runs the add-on guard', () => {
    const pattern = /app\.(get|post|patch|put|delete)(?:(?!\s*app\.(?:get|post|patch|put|delete)\b)[\s\S]){0,3000}?async\s*\(/g;
    const declarations: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) declarations.push(match[0]);

    assert.ok(declarations.length >= 11, `expected >= 11 route declarations, found ${declarations.length}`);

    const ungated = declarations.filter((body) => !body.includes('addon'));
    assert.deepEqual(ungated, [], `inventory routes without the add-on guard: ${ungated.length}`);
  });

  test('the add-on guard runs after authenticate, never before', () => {
    const pattern = /app\.(get|post|patch|put|delete)(?:(?!\s*app\.(?:get|post|patch|put|delete)\b)[\s\S]){0,3000}?async\s*\(/g;
    const wrongOrder: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const body = match[0];
      const at = body.indexOf('addon');
      if (at === -1) continue;
      const auth = body.indexOf('authenticate');
      if (auth === -1 || auth > at) wrongOrder.push(match[1]);
    }
    assert.deepEqual(wrongOrder, [], `add-on guard before authenticate: ${wrongOrder.join(', ')}`);
  });

  test('the student on a sale is looked up scoped to the center, not by id alone', () => {
    // The database cannot enforce this: a foreign key proves the student exists,
    // not that they belong to this center.
    assert.ok(
      /student\.findFirst\(\{\s*where: \{ id: studentId, tenantId \}/.test(source),
      'the sale route must resolve the student with findFirst scoped by tenantId',
    );
    assert.ok(
      !/student\.findUnique\(\{\s*where: \{ id: studentId \}/.test(source),
      'the sale route must not resolve the student by id alone',
    );
  });
});
