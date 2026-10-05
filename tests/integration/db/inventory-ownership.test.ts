import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Cross-tenant ownership of the stock graph, against a real PostgreSQL database.
 *
 * `branch_stocks` is unique on `(branch_id, product_id)` across the *whole*
 * database, not per center. That makes the pair a globally claimed slot: whoever
 * holds the row owns it, and the other center can never create its own. So the
 * question is not only "may center B write to this row" but "may center B claim
 * this pair at all", and the second one is the more dangerous half — a claimed
 * slot is a denial of service against the victim's inventory, and it does not
 * announce itself.
 *
 * Two shapes are attacked for every route, because the guards are separate:
 * both ids foreign, and the dangerous middle case of a foreign *product* on the
 * caller's own branch. The middle case is the one that used to succeed.
 *
 * Destructive, like its siblings: `clean()` empties every business table. Skipped
 * unless TEST_DATABASE_URL points at a disposable test database whose name says
 * so, and refused outright if it is the application's own database.
 */
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

function assertDisposableDatabase(url: string): void {
  const databaseName = (u: string): string => {
    try {
      return decodeURIComponent(new URL(u).pathname.replace(/^\//, ''));
    } catch {
      return '';
    }
  };
  const name = databaseName(url);
  if (!name) throw new Error('TEST_DATABASE_URL is not a parseable database URL.');
  if (!/test/i.test(name)) {
    throw new Error(
      `Refusing to run destructive integration tests against database "${name}": the name does not contain "test". ` +
        'Point TEST_DATABASE_URL at a disposable database.',
    );
  }
  const live = process.env.DATABASE_URL;
  if (live && databaseName(live) === name) {
    throw new Error(`Refusing to run: TEST_DATABASE_URL and DATABASE_URL both point at database "${name}".`);
  }
}
if (TEST_DATABASE_URL) assertDisposableDatabase(TEST_DATABASE_URL);

type FastifyLike = {
  ready(): Promise<void>;
  close(): Promise<void>;
  log: { level: string };
  jwt: {
    sign(payload: Record<string, unknown>, opts?: { expiresIn?: string }): string;
  };
  inject(opts: {
    method: string;
    url: string;
    headers?: Record<string, string>;
    payload?: unknown;
  }): Promise<{ statusCode: number; body: string }>;
};

const authHeaders = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` });

function json(body: string): any {
  return JSON.parse(body);
}

function errorCode(body: string): string | undefined {
  return json(body)?.error?.code;
}

describe(
  'DB-backed stock ownership: one center cannot claim another\'s branch and product pair',
  { skip: !TEST_DATABASE_URL },
  () => {
    let app: FastifyLike;
    let prisma: any;

    // The attacker: center B.
    let adminB: string;
    let tenantAId: string;
    let tenantBId: string;

    // Center A's rows, and center B's own rows for the same entities.
    let branchAId: string;
    let productAId: string;
    let branchBId: string;
    let productBId: string;

    const now = new Date();

    const token = (sub: string, username: string, role: string, tenantId: string) =>
      app.jwt.sign({ sub, username, role, tenantId }, { expiresIn: '1h' });

    async function seed(): Promise<void> {
      const argon2 = await import('argon2');

      const makeTenant = async (label: string) =>
        prisma.tenant.create({
          data: { name: `مركز ${label}`, slug: `inv-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`, isActive: true },
        });

      const tenantA = await makeTenant('أ');
      const tenantB = await makeTenant('ب');
      tenantAId = tenantA.id;
      tenantBId = tenantB.id;

      // Both centers are paid *and* hold the add-on. Otherwise the addon or the
      // lifecycle guard would refuse these requests first, and the suite would go
      // green for the wrong reason: it would be testing the gate, not the scoping.
      for (const tenant of [tenantA, tenantB]) {
        await prisma.subscription.create({
          data: {
            tenantId: tenant.id,
            amount: 1199,
            status: 'ACTIVE',
            periodStart: new Date(now.getTime() - 5 * 86_400_000),
            periodEnd: new Date(now.getTime() + 25 * 86_400_000),
          },
        });
        await prisma.tenantAddon.create({ data: { tenantId: tenant.id, code: 'BOOKS_INVENTORY', enabled: true } });
      }

      const adminBRow = await prisma.user.create({
        data: {
          tenantId: tenantB.id,
          username: 'inv_admin_b',
          fullName: 'مدير ب',
          passwordHash: await argon2.hash('InvDesk@123'),
          role: 'ADMIN',
          phoneNumber: '01000000021',
          preferredLanguage: 'ar',
          isActive: true,
        },
      });
      adminB = token(adminBRow.id, 'inv_admin_b', 'ADMIN', tenantB.id);

      const makeBranch = (tenantId: string, name: string) =>
        prisma.branch.create({ data: { tenantId, name, isActive: true } });
      branchAId = (await makeBranch(tenantA.id, 'فرع أ')).id;
      branchBId = (await makeBranch(tenantB.id, 'فرع ب')).id;

      const makeProduct = (tenantId: string, nameAr: string, searchName: string) =>
        prisma.product.create({
          data: {
            tenantId,
            nameAr,
            searchName,
            sku: null,
            salePrice: 120,
            costPrice: 80,
            isActive: true,
          },
        });
      productAId = (await makeProduct(tenantA.id, 'كتاب أ', 'كتاب ا')).id;
      productBId = (await makeProduct(tenantB.id, 'كتاب ب', 'كتاب ب')).id;
    }

    async function clean(): Promise<void> {
      await prisma.auditLog.deleteMany({});
      await prisma.stockMovement.deleteMany({});
      await prisma.bookSaleLine.deleteMany({});
      await prisma.bookSale.deleteMany({});
      await prisma.branchStock.deleteMany({});
      await prisma.usageRecord.deleteMany({});
      await prisma.expense.deleteMany({});
      await prisma.sessionSettlement.deleteMany({});
      await prisma.sessionReconciliation.deleteMany({});
      await prisma.attendance.deleteMany({});
      await prisma.shiftRegister.deleteMany({});
      await prisma.session.deleteMany({});
      await prisma.student.deleteMany({});
      await prisma.teacher.deleteMany({});
      await prisma.room.deleteMany({});
      await prisma.product.deleteMany({});
      await prisma.branch.deleteMany({});
      await prisma.user.deleteMany({});
      // Cascades to subscriptions and add-ons.
      await prisma.tenant.deleteMany({});
    }

    const call = (method: string, url: string, authToken: string, payload?: unknown) =>
      app.inject({
        method,
        url,
        headers: authHeaders(authToken),
        ...(payload === undefined ? {} : { payload }),
      });

    /**
     * Nothing may be written into the victim's half of the graph, and — because
     * the pair is a globally unique slot — no row may be *claimed* for it either.
     * A refusal that still created the row would leave the victim permanently
     * unable to stock that product at that branch, which is worse than the write
     * it was supposed to prevent.
     */
    const assertNothingClaimed = async (branchId: string, productId: string) => {
      const rows = await prisma.branchStock.findMany({ where: { OR: [{ branchId }, { productId }] } });
      assert.deepEqual(rows, [], 'a stock row was claimed for a foreign branch or product');

      const movements = await prisma.stockMovement.findMany({ where: { OR: [{ branchId }, { productId }] } });
      assert.deepEqual(movements, [], 'a movement was written against a foreign branch or product');

      const audits = await prisma.auditLog.findMany({ where: { tenantId: tenantBId, entityType: 'BRANCH_STOCK' } });
      assert.deepEqual(audits, [], 'the refusal still wrote an audit entry');
    };

    before(async () => {
      process.env.DATABASE_URL = TEST_DATABASE_URL as string;
      const { PrismaClient } = await import('@prisma/client');
      prisma = new PrismaClient();
      const { buildApp } = await import('../../../src/server/app.js');
      app = buildApp() as unknown as FastifyLike;
      await app.ready();
      app.log.level = 'silent';
      await clean();
      await seed();
    });

    after(async () => {
      await clean();
      await app.close();
      await prisma.$disconnect();
    });

    describe('an adjustment cannot move another center\'s shelf', () => {
      test('refuses a foreign branch and product together', async () => {
        const res = await call('POST', '/api/inventory/adjustments', adminB, {
          branchId: branchAId,
          productId: productAId,
          countedQuantity: 500,
        });

        assert.equal(res.statusCode, 404, res.body);
        assert.equal(errorCode(res.body), 'BRANCH_NOT_FOUND');
        await assertNothingClaimed(branchAId, productAId);
      });

      test("refuses a foreign product on the caller's own branch", async () => {
        // The exploit. Every other guard passes here: the branch is B's, so no
        // foreign-key error fires, and the lazy stock row does not exist yet, so
        // nothing contradicts the write. Only the product's own tenant check
        // refuses — and without it, B claims the (B.branch, A.product) slot and
        // A can never stock that title at its own branch again.
        const res = await call('POST', '/api/inventory/adjustments', adminB, {
          branchId: branchBId,
          productId: productAId,
          countedQuantity: 500,
        });

        assert.equal(res.statusCode, 404, res.body);
        assert.equal(errorCode(res.body), 'PRODUCT_NOT_FOUND');
        await assertNothingClaimed(branchAId, productAId);
      });

      test('refuses a foreign branch holding the caller\'s own product', async () => {
        // The mirror image, and it lands on the same slot from the other side.
        const res = await call('POST', '/api/inventory/adjustments', adminB, {
          branchId: branchAId,
          productId: productBId,
          countedQuantity: 500,
        });

        assert.equal(res.statusCode, 404, res.body);
        assert.equal(errorCode(res.body), 'BRANCH_NOT_FOUND');
        await assertNothingClaimed(branchAId, productAId);
      });
    });

    describe('a write-off is a stock movement and is scoped the same way', () => {
      test('refuses a foreign product on the caller\'s own branch', async () => {
        const res = await call('POST', '/api/inventory/write-offs', adminB, {
          branchId: branchBId,
          productId: productAId,
          quantity: 3,
        });

        assert.equal(res.statusCode, 404, res.body);
        assert.equal(errorCode(res.body), 'PRODUCT_NOT_FOUND');
        await assertNothingClaimed(branchAId, productAId);
      });

      test('refuses a foreign branch and product together', async () => {
        const res = await call('POST', '/api/inventory/write-offs', adminB, {
          branchId: branchAId,
          productId: productAId,
          quantity: 3,
        });

        assert.equal(res.statusCode, 404, res.body);
        assert.equal(errorCode(res.body), 'BRANCH_NOT_FOUND');
        await assertNothingClaimed(branchAId, productAId);
      });
    });

    describe('a stock row claimed by another center is not shown or moved', () => {
      // Rows like this exist wherever the old, unasserted write path ran before
      // it was fixed. The routes now refuse before they reach the row, so the
      // only thing left to prove is that no screen presents another center's
      // branch as one of its own.
      //
      // The row is stamped with B's own tenant — that is the whole shape of the
      // old bug — so filtering the reads by the row's `tenantId` would not help.
      // What distinguishes it is the branch it names.
      test('the product list hides a foreign branch\'s quantity', async () => {
        await prisma.branchStock.create({
          data: { tenantId: tenantBId, branchId: branchAId, productId: productBId, quantity: 42 },
        });
        await prisma.stockMovement.create({
          data: {
            tenantId: tenantBId,
            branchId: branchAId,
            productId: productBId,
            type: 'PURCHASE',
            quantity: 42,
            delta: 42,
          },
        });

        const products = await call('GET', `/api/inventory/products?branchId=${branchAId}`, adminB);
        assert.equal(products.statusCode, 200, products.body);
        const listed = json(products.body).data.products as Array<{ id: string; stock: Array<{ quantity: number }> }>;
        const own = listed.find((product) => product.id === productBId);
        assert.ok(own, "B's own product should still be listed");
        assert.deepEqual(own.stock, [], "another center's shelf was presented as B's");

        // Unfiltered, the same row must not appear under that branch either.
        const all = await call('GET', '/api/inventory/products', adminB);
        assert.equal(all.statusCode, 200, all.body);
        const unfiltered = json(all.body).data.products as Array<{ id: string; stock: Array<{ branchId: string }> }>;
        const ownUnfiltered = unfiltered.find((product) => product.id === productBId);
        assert.deepEqual(ownUnfiltered?.stock ?? [], [], 'a foreign branch appeared in the unfiltered stock list');

        const movements = await call('GET', `/api/inventory/movements?branchId=${branchAId}`, adminB);
        assert.equal(movements.statusCode, 200, movements.body);
        assert.deepEqual(json(movements.body).data.movements, [], 'a foreign branch\'s movement was listed');

        const report = await call('GET', `/api/inventory/reports?branchId=${branchAId}`, adminB);
        assert.equal(report.statusCode, 200, report.body);
        assert.deepEqual(json(report.body).data.lowStock, [], "another center's shelf appeared in the stock report");
      });
    });

    describe('a center keeps full access to its own shelf', () => {
      test('B can purchase, adjust and write off its own pair', async () => {
        // Paired with the refusals above: those would also pass if these routes
        // were simply broken. The order matters — the write-off needs stock to
        // remove, and the adjustment needs a row to read.
        const purchase = await call('POST', '/api/inventory/purchases', adminB, {
          branchId: branchBId,
          items: [{ productId: productBId, quantity: 20, unitCost: 80 }],
        });
        assert.equal(purchase.statusCode, 201, purchase.body);

        const afterPurchase = await prisma.branchStock.findFirst({
          where: { branchId: branchBId, productId: productBId },
        });
        assert.equal(afterPurchase.tenantId, tenantBId, "the stock row was not stamped with B's tenant");
        assert.equal(afterPurchase.quantity, 20);

        const writeOff = await call('POST', '/api/inventory/write-offs', adminB, {
          branchId: branchBId,
          productId: productBId,
          quantity: 5,
        });
        assert.equal(writeOff.statusCode, 200, writeOff.body);

        const adjustment = await call('POST', '/api/inventory/adjustments', adminB, {
          branchId: branchBId,
          productId: productBId,
          countedQuantity: 12,
        });
        assert.equal(adjustment.statusCode, 200, adjustment.body);

        const finalStock = await prisma.branchStock.findFirst({
          where: { branchId: branchBId, productId: productBId },
        });
        assert.equal(finalStock.quantity, 12);

        const ledger = await prisma.stockMovement.findMany({
          where: { branchId: branchBId, productId: productBId },
          orderBy: { createdAt: 'asc' },
        });
        assert.deepEqual(
          ledger.map((movement) => movement.type),
          ['PURCHASE', 'WRITE_OFF', 'ADJUSTMENT'],
          'every movement must be explainable from the ledger',
        );
        assert.ok(
          ledger.every((movement) => movement.tenantId === tenantBId),
          'a movement was stamped with the wrong tenant',
        );
      });

      test("A's own shelf is untouched by anything B did", async () => {
        const victimRows = await prisma.branchStock.findMany({ where: { tenantId: tenantAId } });
        assert.deepEqual(victimRows, [], "B wrote into A's stock");
      });
    });
  },
);
