/**
 * Pure inventory and book-sale math.
 *
 * Every formula that turns quantities and prices into stock deltas, invoice
 * totals or profit lives here, so it can be unit-tested without a database. The
 * route module may only orchestrate: it reads rows, calls these functions, and
 * writes the result back (AGENTS.md: financial arithmetic isolation).
 *
 * The rules these functions encode:
 *
 *  - Stock is per branch. A branch may only spend what its own shelf holds.
 *  - A sale may never take stock below zero, even transiently.
 *  - `branch_stocks.quantity` is a cached running total of the movement ledger.
 *    It is advanced by a delta, never set to a computed total, so a lost
 *    transaction can never silently rewrite the ledger.
 *  - Prices are snapshotted onto the sale line. Editing a product afterwards
 *    must not change what a student was charged or what the center made.
 *  - Recorded sales are immutable. A mistake is undone with a reversal, never
 *    by editing or deleting the original.
 */
import { roundMoney, toMoneyNumber } from '../admin/billingMath.js';
/** Which way a movement type moves stock. WRITEOFF is deliberately OUT. */
export const MOVEMENT_DIRECTION = {
    PURCHASE: 'IN',
    SALE: 'OUT',
    ADJUSTMENT: null, // sign is data-driven, decided by the caller
    WRITE_OFF: 'OUT',
    RETURN: 'IN',
};
/**
 * The signed change a movement applies to on-hand quantity.
 *
 * A negative result is the caller asking for something impossible, and is
 * returned rather than clamped: silently turning an oversell into a smaller sale
 * would hand the receptionist a sale she never made.
 */
export function computeStockDelta(type, quantity, signedQuantity) {
    const qty = Number.isFinite(quantity) ? Math.trunc(quantity) : 0;
    if (qty <= 0) {
        throw new RangeError('Movement quantity must be a positive whole number.');
    }
    if (type === 'ADJUSTMENT') {
        // An adjustment states the new truth, so the caller passes the signed
        // change. It may not be zero: a no-op movement would be noise in the ledger.
        const delta = Number.isFinite(signedQuantity) ? Math.trunc(signedQuantity) : 0;
        if (delta === 0) {
            throw new RangeError('An adjustment must move stock by at least one unit.');
        }
        return delta;
    }
    return MOVEMENT_DIRECTION[type] === 'IN' ? qty : -qty;
}
/**
 * Whether `quantity` units can leave a shelf holding `available`.
 *
 * Used for the sale path, where the caller has already decided the direction.
 */
export function canIssueStock(available, quantity) {
    const have = Number.isFinite(available) ? Math.trunc(available) : 0;
    const want = Number.isFinite(quantity) ? Math.trunc(quantity) : 0;
    if (want <= 0) {
        return { ok: false, reason: 'INSUFFICIENT_STOCK', available: have, requested: want };
    }
    if (have - want < 0) {
        return { ok: false, reason: 'INSUFFICIENT_STOCK', available: have, requested: want };
    }
    return { ok: true, remaining: have - want };
}
/**
 * Prices one sale and totals it, refusing the whole basket if any line cannot be
 * covered.
 *
 * All-or-nothing is deliberate. A multi-item basket that half-succeeds would
 * leave the student holding some of what they paid for and a stock ledger that
 * no longer matches the sale.
 */
export function computeSale(items, availableByProduct) {
    const shortfalls = [];
    const seen = new Map();
    for (const item of items) {
        const qty = Number.isFinite(item.quantity) ? Math.trunc(item.quantity) : 0;
        if (qty <= 0) {
            shortfalls.push({ productId: item.productId, available: availableByProduct.get(item.productId) ?? 0, requested: qty });
            continue;
        }
        // Two lines for the same product must be checked against the same shelf as
        // one combined quantity, or a basket of 2+3 of the last 4 copies passes.
        const already = seen.get(item.productId) ?? 0;
        seen.set(item.productId, already + qty);
        const available = availableByProduct.get(item.productId) ?? 0;
        const check = canIssueStock(available, already + qty);
        if (!check.ok) {
            shortfalls.push({ productId: item.productId, available, requested: already + qty });
        }
    }
    if (shortfalls.length > 0)
        return { ok: false, shortfalls };
    const lines = items.map((item) => {
        const quantity = Math.trunc(item.quantity);
        const unitPrice = roundMoney(Math.max(0, toMoneyNumber(item.unitPrice)));
        const unitCost = roundMoney(Math.max(0, toMoneyNumber(item.unitCost)));
        const lineTotal = roundMoney(unitPrice * quantity);
        const lineCost = roundMoney(unitCost * quantity);
        return { productId: item.productId, quantity, unitPrice, unitCost, lineTotal, lineCost, lineProfit: roundMoney(lineTotal - lineCost) };
    });
    const total = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
    const costTotal = roundMoney(lines.reduce((sum, line) => sum + line.lineCost, 0));
    return { ok: true, sale: { lines, total, costTotal, profit: roundMoney(total - costTotal) } };
}
/**
 * The stock effect of voiding a sale: every line goes back on the shelf.
 *
 * A void is a RETURN into the same branch, not a deletion, so the ledger still
 * accounts for the items having left and come back.
 */
export function computeVoidDeltas(lines) {
    return lines.map((line) => ({
        productId: line.productId,
        quantity: Math.trunc(line.quantity),
        delta: Math.trunc(line.quantity),
    }));
}
// ─── Purchase / adjustment pricing ───────────────────────────────────────────
/**
 * What a purchase receipt is worth at the cost the center is paying.
 *
 * Kept separate from the sale total on purpose: the cash leaving the drawer for
 * a restock is not the same figure as the revenue booked when those items are
 * later sold, and conflating them is how a center ends up unable to say whether
 * it is profitable.
 */
export function computePurchaseCost(items) {
    const total = items.reduce((sum, item) => sum + roundMoney(Math.max(0, toMoneyNumber(item.unitCost)) * Math.max(0, Math.trunc(item.quantity))), 0);
    return { costTotal: roundMoney(total) };
}
/** An adjustment states the difference the shelf was found to be out by. */
export function computeAdjustmentDelta(currentQuantity, countedQuantity) {
    const current = Number.isFinite(currentQuantity) ? Math.trunc(currentQuantity) : 0;
    const counted = Number.isFinite(countedQuantity) ? Math.trunc(countedQuantity) : 0;
    if (counted < 0) {
        throw new RangeError('A physical count cannot be negative.');
    }
    // A count that matches the ledger produces 0, which computeStockDelta rejects:
    // there is nothing to record, and a zero-delta row would only be noise.
    return counted - current;
}
/** True when `date` falls inside the period, inclusive of both ends. */
export function isWithinPeriod(date, period) {
    const at = new Date(date).getTime();
    return at >= new Date(period.from).getTime() && at <= new Date(period.to).getTime();
}
/**
 * Revenue, cost and profit over a period, excluding voided sales.
 *
 * A voided sale is left out of the totals rather than subtracted, because the
 * reversal that put the stock back is what makes the money right; netting a
 * negative sale would double-count the correction.
 */
export function summarizeSales(rows, period) {
    let revenue = 0;
    let cost = 0;
    let count = 0;
    let voided = 0;
    for (const row of rows) {
        if (!isWithinPeriod(row.createdAt, period))
            continue;
        if (row.status === 'VOIDED') {
            voided += 1;
            continue;
        }
        revenue = roundMoney(revenue + Math.max(0, toMoneyNumber(row.total)));
        cost = roundMoney(cost + Math.max(0, toMoneyNumber(row.costTotal)));
        count += 1;
    }
    return { revenue, cost, profit: roundMoney(revenue - cost), count, voided };
}
/**
 * Re-derives a shelf's on-hand quantity from its ledger.
 *
 * This is the audit that makes the cached `branch_stocks.quantity` trustworthy:
 * if the two ever disagree, a transaction was lost, and the ledger — not the
 * cache — is the record of what actually happened.
 */
export function reconcileStockFromLedger(movements) {
    return movements.reduce((sum, movement) => sum + Math.trunc(movement.delta), 0);
}
