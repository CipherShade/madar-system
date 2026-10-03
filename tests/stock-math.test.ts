import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  MOVEMENT_DIRECTION,
  canIssueStock,
  computeAdjustmentDelta,
  computePurchaseCost,
  computeSale,
  computeStockDelta,
  computeVoidDeltas,
  isWithinPeriod,
  reconcileStockFromLedger,
  summarizeSales,
} from '../src/server/modules/inventory/stockMath.js';

describe('STOCK MATH - movement direction', () => {
  test('purchases and returns add stock, sales and write-offs remove it', () => {
    assert.equal(computeStockDelta('PURCHASE', 10), 10);
    assert.equal(computeStockDelta('RETURN', 3), 3);
    assert.equal(computeStockDelta('SALE', 4), -4);
    assert.equal(computeStockDelta('WRITE_OFF', 2), -2);
  });

  test('a write-off leaves the shelf rather than returning to it', () => {
    // A damaged book is gone, not restocked: treating this as a return would
    // invent inventory the center does not own.
    assert.equal(MOVEMENT_DIRECTION.WRITE_OFF, 'OUT');
  });

  test('an adjustment takes the signed change the caller measured', () => {
    assert.equal(computeStockDelta('ADJUSTMENT', 1, 5), 5, 'a count found 5 more than the ledger said');
    assert.equal(computeStockDelta('ADJUSTMENT', 1, -3), -3, 'a count found 3 fewer');
  });

  test('a zero-delta adjustment is refused rather than recorded as noise', () => {
    assert.throws(() => computeStockDelta('ADJUSTMENT', 1, 0), RangeError);
    assert.throws(() => computeStockDelta('ADJUSTMENT', 1), RangeError);
  });

  test('a non-positive quantity is refused for every movement type', () => {
    for (const type of ['PURCHASE', 'SALE', 'WRITE_OFF', 'RETURN'] as const) {
      assert.throws(() => computeStockDelta(type, 0), RangeError, type);
      assert.throws(() => computeStockDelta(type, -3), RangeError, type);
    }
  });

  test('a physical count may reduce stock but never go below zero', () => {
    assert.equal(computeAdjustmentDelta(10, 7), -3);
    assert.equal(computeAdjustmentDelta(10, 10), 0);
    assert.equal(computeAdjustmentDelta(0, 4), 4);
    assert.throws(() => computeAdjustmentDelta(10, -1), RangeError);
  });
});

describe('STOCK MATH - issuing stock', () => {
  test('stock can be issued down to exactly zero', () => {
    assert.deepEqual(canIssueStock(5, 5), { ok: true, remaining: 0 });
  });

  test('one unit short is refused and reports what is actually there', () => {
    assert.deepEqual(canIssueStock(4, 5), { ok: false, reason: 'INSUFFICIENT_STOCK', available: 4, requested: 5 });
  });

  test('an empty shelf cannot issue anything', () => {
    assert.equal(canIssueStock(0, 1).ok, false);
  });
});

describe('STOCK MATH - pricing a sale', () => {
  test('totals revenue, cost and profit across the basket', () => {
    const result = computeSale(
      [
        { productId: 'p1', quantity: 3, unitPrice: 50, unitCost: 30 },
        { productId: 'p2', quantity: 2, unitPrice: 25, unitCost: 40 },
      ],
      new Map([['p1', 10], ['p2', 5]]),
    );

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.sale.total, 200); // 3×50 + 2×25
    assert.equal(result.sale.costTotal, 170); // 3×30 + 2×40
    assert.equal(result.sale.profit, 30);
  });

  test('the whole basket is refused when one line cannot be covered', () => {
    const result = computeSale(
      [
        { productId: 'p1', quantity: 1, unitPrice: 50, unitCost: 30 },
        { productId: 'p2', quantity: 99, unitPrice: 25, unitCost: 10 },
      ],
      new Map([['p1', 10], ['p2', 1]]),
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(result.shortfalls, [{ productId: 'p2', available: 1, requested: 99 }]);
  });

  test('two lines for the same product are checked against the shelf as one quantity', () => {
    // The bug this prevents: 2 and 3 of the last 4 copies each pass on their own.
    const result = computeSale(
      [
        { productId: 'p1', quantity: 2, unitPrice: 10, unitCost: 5 },
        { productId: 'p1', quantity: 3, unitPrice: 10, unitCost: 5 },
      ],
      new Map([['p1', 4]]),
    );

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(result.shortfalls, [{ productId: 'p1', available: 4, requested: 5 }]);
  });

  test('a product with no stock row is treated as an empty shelf, not as unlimited', () => {
    const result = computeSale([{ productId: 'ghost', quantity: 1, unitPrice: 10, unitCost: 5 }], new Map());

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.deepEqual(result.shortfalls, [{ productId: 'ghost', available: 0, requested: 1 }]);
  });

  test('prices are frozen onto the line so later product edits cannot rewrite history', () => {
    const result = computeSale([{ productId: 'p1', quantity: 2, unitPrice: 50, unitCost: 30 }], new Map([['p1', 10]]));

    assert.equal(result.ok, true);
    if (!result.ok) return;
    const [line] = result.sale.lines;
    assert.equal(line.unitPrice, 50);
    assert.equal(line.unitCost, 30);
    assert.equal(line.lineTotal, 100);
    assert.equal(line.lineCost, 60);
    assert.equal(line.lineProfit, 40);
  });

  test('money is rounded to 2 decimals rather than leaking floating point', () => {
    const result = computeSale([{ productId: 'p1', quantity: 3, unitPrice: 19.99, unitCost: 0.1 }], new Map([['p1', 10]]));

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.sale.total, 59.97);
    assert.equal(result.sale.costTotal, 0.3);
  });

  test('a negative price is clamped to zero rather than credited back', () => {
    const result = computeSale([{ productId: 'p1', quantity: 1, unitPrice: -100, unitCost: 10 }], new Map([['p1', 10]]));

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.sale.total, 0);
  });
});

describe('STOCK MATH - voids return stock without erasing the sale', () => {
  test('a void puts every line back on the same shelf', () => {
    const deltas = computeVoidDeltas([
      { productId: 'p1', quantity: 3 },
      { productId: 'p2', quantity: 2 },
    ]);

    assert.deepEqual(deltas, [
      { productId: 'p1', quantity: 3, delta: 3 },
      { productId: 'p2', quantity: 2, delta: 2 },
    ]);
  });

  test('the ledger still reconciles to the shelf after a sale and its void', () => {
    const start = 10;
    const sold = computeStockDelta('SALE', 4);
    const returned = computeVoidDeltas([{ productId: 'p1', quantity: 4 }])[0].delta;

    assert.equal(reconcileStockFromLedger([
      { quantity: 10, delta: start },
      { quantity: 4, delta: sold },
      { quantity: 4, delta: returned },
    ]), 10, 'a voided sale must leave the shelf exactly where it started');
  });
});

describe('STOCK MATH - purchase costing', () => {
  test('a receipt is valued at what the center is paying, not at retail', () => {
    const { costTotal } = computePurchaseCost([
      { quantity: 10, unitCost: 22.5 },
      { quantity: 4, unitCost: 15 },
    ]);

    assert.equal(costTotal, 285);
  });

  test('a zero-cost line does not break the total', () => {
    assert.equal(computePurchaseCost([{ quantity: 5, unitCost: 0 }]).costTotal, 0);
  });
});

describe('STOCK MATH - reporting', () => {
  const period = { from: '2026-10-01T00:00:00.000Z', to: '2026-10-31T23:59:59.999Z' };

  test('period bounds are inclusive at both ends', () => {
    assert.equal(isWithinPeriod('2026-10-01T00:00:00.000Z', period), true);
    assert.equal(isWithinPeriod('2026-10-31T23:59:59.999Z', period), true);
    assert.equal(isWithinPeriod('2026-09-30T23:59:59.999Z', period), false);
    assert.equal(isWithinPeriod('2026-11-01T00:00:00.000Z', period), false);
  });

  test('revenue, cost and profit come from recorded sales in the period', () => {
    const summary = summarizeSales(
      [
        { status: 'RECORDED', total: 200, costTotal: 120, createdAt: '2026-10-05T10:00:00.000Z' },
        { status: 'RECORDED', total: 50, costTotal: 20, createdAt: '2026-10-20T10:00:00.000Z' },
      ],
      period,
    );

    assert.deepEqual(summary, { revenue: 250, cost: 140, profit: 110, count: 2, voided: 0 });
  });

  test('a voided sale is excluded and counted separately, not subtracted', () => {
    const summary = summarizeSales(
      [
        { status: 'RECORDED', total: 200, costTotal: 120, createdAt: '2026-10-05T10:00:00.000Z' },
        { status: 'VOIDED', total: 200, costTotal: 120, createdAt: '2026-10-06T10:00:00.000Z' },
      ],
      period,
    );

    assert.equal(summary.revenue, 200);
    assert.equal(summary.cost, 120);
    assert.equal(summary.count, 1);
    assert.equal(summary.voided, 1);
  });

  test('sales outside the period are ignored entirely', () => {
    const summary = summarizeSales(
      [
        { status: 'RECORDED', total: 999, costTotal: 1, createdAt: '2026-09-15T10:00:00.000Z' },
        { status: 'RECORDED', total: 100, costTotal: 60, createdAt: '2026-10-10T10:00:00.000Z' },
      ],
      period,
    );

    assert.equal(summary.revenue, 100);
    assert.equal(summary.count, 1);
  });

  test('selling below cost reports a loss rather than clamping profit to zero', () => {
    const summary = summarizeSales(
      [{ status: 'RECORDED', total: 80, costTotal: 100, createdAt: '2026-10-05T10:00:00.000Z' }],
      period,
    );

    assert.equal(summary.profit, -20);
  });
});

describe('STOCK MATH - ledger reconciliation', () => {
  test('the ledger sums to the on-hand quantity', () => {
    assert.equal(
      reconcileStockFromLedger([
        { quantity: 20, delta: 20 },
        { quantity: 5, delta: -5 },
        { quantity: 2, delta: 2 },
      ]),
      17,
    );
  });

  test('an empty ledger means an empty shelf', () => {
    assert.equal(reconcileStockFromLedger([]), 0);
  });
});
