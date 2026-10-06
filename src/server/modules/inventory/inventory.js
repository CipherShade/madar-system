import { Prisma } from '@prisma/client';
import { Role, PaymentMethod } from '../../../shared/constants/index.js';
import { normalizeArabicText } from '../../../shared/utils/arabicNormalization.js';
import { prisma } from '../../lib/prisma.js';
import { authenticate, requireRoles } from '../auth/auth.js';
import { requireTenantWritable } from '../../lib/tenantLifecycle.js';
import { requireAddon } from '../../lib/addons.js';
import { isValidUUID, parsePagination, uuidParamsSchema } from '../../lib/http.js';
import { BOOKS_INVENTORY_ADDON } from '../../../shared/constants/subscription.js';
import { recordAuditEntry } from '../reports/audit.js';
import { computeAdjustmentDelta, computePurchaseCost, computeSale, computeStockDelta, computeVoidDeltas, summarizeSales, } from './stockMath.js';
/**
 * Books & Inventory: products, per-branch stock, and sales to students.
 *
 * Two rules shape every handler here.
 *
 * 1. Nothing is reachable without the add-on. `requireAddon` runs after
 *    `authenticate` on every route, reads or write, because an inventory screen a
 *    center never paid for is a liability, not a free trial.
 *
 * 2. Stock is only ever changed by a conditional update that carries its own
 *    precondition. `issueStock` below does not read the quantity and then write
 *    a new one — it asks the database to decrement *only if there is enough*,
 *    and treats zero affected rows as "someone else got there first". Reading
 *    then writing is what lets two desks both sell the last copy.
 *
 * Tenant scoping is applied to every lookup, including the ones that look like
 * they cannot leak: a `productId` from another center simply does not match.
 */
const addon = requireAddon(BOOKS_INVENTORY_ADDON);
function invalid(message, messageEn, code = 'VALIDATION_ERROR') {
    return { success: false, error: { code, message, messageEn } };
}
// ─── Schemas ─────────────────────────────────────────────────────────────────
const moneySchema = { type: 'number', minimum: 0, maximum: 1_000_000 };
const productBodySchema = {
    type: 'object',
    required: ['nameAr', 'salePrice'],
    additionalProperties: false,
    properties: {
        nameAr: { type: 'string', minLength: 1, maxLength: 120 },
        nameEn: { type: ['string', 'null'], maxLength: 120 },
        sku: { type: ['string', 'null'], maxLength: 60 },
        categoryAr: { type: ['string', 'null'], maxLength: 80 },
        salePrice: moneySchema,
        costPrice: moneySchema,
        isActive: { type: 'boolean' },
    },
};
const saleBodySchema = {
    type: 'object',
    required: ['branchId', 'studentId', 'paymentMethod', 'items'],
    additionalProperties: false,
    properties: {
        branchId: { type: 'string', format: 'uuid' },
        studentId: { type: 'string', format: 'uuid' },
        paymentMethod: { type: 'string', enum: Object.values(PaymentMethod) },
        note: { type: ['string', 'null'], maxLength: 300 },
        items: {
            type: 'array',
            minItems: 1,
            maxItems: 50,
            items: {
                type: 'object',
                required: ['productId', 'quantity'],
                additionalProperties: false,
                properties: {
                    productId: { type: 'string', format: 'uuid' },
                    quantity: { type: 'integer', minimum: 1, maximum: 1000 },
                },
            },
        },
    },
};
const purchaseBodySchema = {
    type: 'object',
    required: ['branchId', 'items'],
    additionalProperties: false,
    properties: {
        branchId: { type: 'string', format: 'uuid' },
        note: { type: ['string', 'null'], maxLength: 300 },
        items: {
            type: 'array',
            minItems: 1,
            maxItems: 100,
            items: {
                type: 'object',
                required: ['productId', 'quantity', 'unitCost'],
                additionalProperties: false,
                properties: {
                    productId: { type: 'string', format: 'uuid' },
                    quantity: { type: 'integer', minimum: 1, maximum: 10000 },
                    unitCost: moneySchema,
                },
            },
        },
    },
};
const adjustmentBodySchema = {
    type: 'object',
    required: ['branchId', 'productId', 'countedQuantity'],
    additionalProperties: false,
    properties: {
        branchId: { type: 'string', format: 'uuid' },
        productId: { type: 'string', format: 'uuid' },
        countedQuantity: { type: 'integer', minimum: 0, maximum: 1000000 },
        note: { type: ['string', 'null'], maxLength: 300 },
    },
};
const writeOffBodySchema = {
    type: 'object',
    required: ['branchId', 'productId', 'quantity'],
    additionalProperties: false,
    properties: {
        branchId: { type: 'string', format: 'uuid' },
        productId: { type: 'string', format: 'uuid' },
        quantity: { type: 'integer', minimum: 1, maximum: 10000 },
        note: { type: ['string', 'null'], maxLength: 300 },
    },
};
/** `uuidParamsSchema` only declares an `id` param, which this route does not have. */
const studentParamsSchema = {
    type: 'object',
    properties: { studentId: { type: 'string', format: 'uuid' } },
    required: ['studentId'],
};
/**
 * The row that must exist for a branch to hold a product at all.
 *
 * Stock is created lazily on first movement rather than by a separate "add to
 * branch" step: a center stocking 200 titles should not have to seed 200 rows
 * before it can record the delivery.
 */
async function ensureStockRow(db, tenantId, branchId, productId) {
    const row = await db.branchStock.upsert({
        where: { branchId_productId: { branchId, productId } },
        create: { tenantId, branchId, productId, quantity: 0 },
        update: {},
        select: { tenantId: true },
    });
    // `branchId_productId` is unique across the whole database, not per center, so
    // an upsert on that pair can land on a row another center already owns.
    // Incrementing it would move that center's stock, and this center could never
    // create its own row for the pair afterwards, because the slot is taken.
    //
    // Every route below asserts the branch and the product belong to this center
    // before it gets here, which is what actually closes that door. This check is
    // the backstop for the case those assertions cannot cover: a pair claimed
    // before they existed, by a version that did not ask.
    if (row.tenantId !== tenantId) {
        throw new Error('STOCK_ROW_FOREIGN_TENANT');
    }
}
/**
 * Moves stock by `delta`, refusing to go below zero, and writes the ledger row.
 *
 * The precondition lives in the `where` clause, so the database evaluates it
 * against the current row while holding the write lock. Two concurrent sales of
 * the last copy both issue `quantity >= 1`; the first commits, the second finds
 * zero rows left to update and is told the stock is gone. The CHECK constraint on
 * `branch_stocks.quantity` is the backstop underneath this.
 */
async function applyStockMovement(db, input) {
    await ensureStockRow(db, input.tenantId, input.branchId, input.productId);
    // Inbound and adjustments have no floor to clear: a purchase cannot fail
    // because the shelf happens to be empty.
    const where = input.delta >= 0
        ? { branchId: input.branchId, productId: input.productId, tenantId: input.tenantId }
        : {
            branchId: input.branchId,
            productId: input.productId,
            tenantId: input.tenantId,
            quantity: { gte: Math.abs(input.delta) },
        };
    const updated = await db.branchStock.updateMany({
        where,
        data: { quantity: { increment: input.delta } },
    });
    if (updated.count === 0) {
        return { ok: false, reason: 'INSUFFICIENT_STOCK' };
    }
    await db.stockMovement.create({
        data: {
            tenantId: input.tenantId,
            branchId: input.branchId,
            productId: input.productId,
            type: input.type,
            quantity: input.quantity,
            delta: input.delta,
            unitCost: input.unitCost ?? null,
            saleId: input.saleId ?? null,
            note: input.note ?? null,
            createdById: input.createdById ?? null,
        },
    });
    return { ok: true };
}
/** Confirms the branch belongs to this center before anything is written to it. */
async function assertBranch(db, tenantId, branchId) {
    if (!isValidUUID(branchId))
        return false;
    const branch = await db.branch.findFirst({ where: { id: branchId, tenantId }, select: { id: true } });
    return branch !== null;
}
/**
 * The same question for a product, and it matters just as much: a foreign
 * `productId` is not a foreign key error, it is a perfectly valid row.
 */
async function assertProduct(db, tenantId, productId) {
    if (!isValidUUID(productId))
        return false;
    const product = await db.product.findFirst({ where: { id: productId, tenantId }, select: { id: true } });
    return product !== null;
}
/**
 * The refusal for a stock pair this center cannot legitimately own. Only a
 * pre-existing inconsistency can reach it, so it says so instead of blaming the
 * caller's numbers, and names nothing that belongs to another center.
 */
function stockRowConflict() {
    return invalid('سجل مخزون غير متسق لهذا الفرع والمنتج، راجع الدعم الفني.', 'The stock record for this branch and product is inconsistent; please contact support.', 'STOCK_INTEGRITY_CONFLICT');
}
// ─── Routes ──────────────────────────────────────────────────────────────────
const inventoryRoutes = async (app) => {
    /** Products with their on-hand quantity at each branch. */
    app.get('/products', { preHandler: [authenticate, addon] }, async (request, reply) => {
        const tenantId = request.user?.tenantId;
        if (!tenantId) {
            return reply.code(403).send(invalid('الحساب غير مرتبط بمركز تعليمي.', 'Account has no tenant assigned.', 'TENANT_CONTEXT_MISSING'));
        }
        const pagination = parsePagination(request.query);
        if (!pagination.ok)
            return reply.code(400).send(pagination.error);
        const { page, limit, skip } = pagination;
        const query = String(request.query.search ?? '').trim();
        const branchId = request.query.branchId;
        const products = await prisma.product.findMany({
            where: {
                tenantId,
                ...(query ? { searchName: { contains: normalizeArabicText(query) } } : {}),
            },
            include: {
                // Scoped by the *branch's* ownership, not the row's own `tenantId`. A row
                // that a center claimed with someone else's branch is stamped with the
                // claimer's tenant, so filtering on `tenantId` would happily show it —
                // and the shelf on screen would belong to a branch that is not theirs.
                branchStocks: branchId
                    ? { where: { branchId: String(branchId), branch: { tenantId } }, select: { quantity: true, reorderLevel: true } }
                    : { where: { branch: { tenantId } }, select: { quantity: true, reorderLevel: true, branchId: true } },
            },
            orderBy: { nameAr: 'asc' },
            skip,
            take: limit,
        });
        return reply.send({
            success: true,
            data: {
                products: products.map((product) => ({
                    id: product.id,
                    nameAr: product.nameAr,
                    nameEn: product.nameEn,
                    sku: product.sku,
                    categoryAr: product.categoryAr,
                    salePrice: Number(product.salePrice),
                    costPrice: Number(product.costPrice),
                    isActive: product.isActive,
                    stock: product.branchStocks.map((stock) => ({
                        branchId: 'branchId' in stock ? stock.branchId : String(branchId),
                        quantity: stock.quantity,
                        reorderLevel: stock.reorderLevel,
                        belowReorderLevel: stock.quantity <= stock.reorderLevel,
                    })),
                    totalQuantity: product.branchStocks.reduce((sum, stock) => sum + stock.quantity, 0),
                })),
                pagination: { page, limit },
            },
        });
    });
    app.post('/products', {
        preHandler: [authenticate, requireRoles(Role.ADMIN), requireTenantWritable, addon],
        schema: { body: productBodySchema },
    }, async (request, reply) => {
        const tenantId = request.user?.tenantId;
        if (!tenantId) {
            return reply.code(403).send(invalid('الحساب غير مرتبط بمركز تعليمي.', 'Account has no tenant assigned.', 'TENANT_CONTEXT_MISSING'));
        }
        const body = request.body;
        const costPrice = body.costPrice ?? 0;
        if (costPrice > body.salePrice) {
            return reply.code(400).send(invalid('سعر التكلفة لا يمكن أن يتجاوز سعر البيع.', 'Cost price cannot be higher than the sale price.'));
        }
        try {
            const product = await prisma.product.create({
                data: {
                    tenantId,
                    nameAr: body.nameAr.trim(),
                    nameEn: body.nameEn?.trim() || null,
                    searchName: normalizeArabicText(body.nameAr),
                    sku: body.sku?.trim() || null,
                    categoryAr: body.categoryAr?.trim() || null,
                    salePrice: new Prisma.Decimal(body.salePrice),
                    costPrice: new Prisma.Decimal(costPrice),
                    isActive: body.isActive ?? true,
                },
            });
            return reply.code(201).send({ success: true, data: { product } });
        }
        catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                return reply.code(409).send(invalid('كود المنتج مستخدم بالفعل في هذا المركز.', 'This SKU is already used in your center.'));
            }
            throw error;
        }
    });
    /**
     * Editing a product changes future prices only.
     *
     * Sales keep the unit price and unit cost they were written with, so raising
     * today's price cannot restate what a student was charged in March, and
     * correcting a mistyped cost cannot rewrite last month's profit.
     */
    app.patch('/products/:id', {
        preHandler: [authenticate, requireRoles(Role.ADMIN), requireTenantWritable, addon],
        schema: { params: uuidParamsSchema, body: { ...productBodySchema, required: [] } },
    }, async (request, reply) => {
        const tenantId = request.user?.tenantId;
        if (!tenantId) {
            return reply.code(403).send(invalid('الحساب غير مرتبط بمركز تعليمي.', 'Account has no tenant assigned.', 'TENANT_CONTEXT_MISSING'));
        }
        const body = request.body;
        const before = await prisma.product.findFirst({ where: { id: request.params.id, tenantId } });
        if (!before) {
            return reply.code(404).send(invalid('المنتج غير موجود.', 'Product not found.', 'PRODUCT_NOT_FOUND'));
        }
        const nextSale = body.salePrice ?? Number(before.salePrice);
        const nextCost = body.costPrice ?? Number(before.costPrice);
        if (nextCost > nextSale) {
            return reply.code(400).send(invalid('سعر التكلفة لا يمكن أن يتجاوز سعر البيع.', 'Cost price cannot be higher than the sale price.'));
        }
        try {
            const product = await prisma.product.update({
                where: { id: before.id, tenantId },
                data: {
                    ...(body.nameAr === undefined ? {} : { nameAr: body.nameAr.trim(), searchName: normalizeArabicText(body.nameAr) }),
                    ...(body.nameEn === undefined ? {} : { nameEn: body.nameEn?.trim() || null }),
                    ...(body.sku === undefined ? {} : { sku: body.sku?.trim() || null }),
                    ...(body.categoryAr === undefined ? {} : { categoryAr: body.categoryAr?.trim() || null }),
                    ...(body.salePrice === undefined ? {} : { salePrice: new Prisma.Decimal(nextSale) }),
                    ...(body.costPrice === undefined ? {} : { costPrice: new Prisma.Decimal(nextCost) }),
                    ...(body.isActive === undefined ? {} : { isActive: body.isActive }),
                },
            });
            return reply.send({ success: true, data: { product } });
        }
        catch (error) {
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
                return reply.code(409).send(invalid('كود المنتج مستخدم بالفعل في هذا المركز.', 'This SKU is already used in your center.'));
            }
            throw error;
        }
    });
    /** Records a delivery from a supplier: stock in, at the cost paid. */
    app.post('/purchases', {
        preHandler: [authenticate, requireRoles(Role.ADMIN), requireTenantWritable, addon],
        schema: { body: purchaseBodySchema },
    }, async (request, reply) => {
        const tenantId = request.user?.tenantId;
        if (!tenantId) {
            return reply.code(403).send(invalid('الحساب غير مرتبط بمركز تعليمي.', 'Account has no tenant assigned.', 'TENANT_CONTEXT_MISSING'));
        }
        const { branchId, items, note } = request.body;
        if (!(await assertBranch(prisma, tenantId, branchId))) {
            return reply.code(404).send(invalid('الفرع غير موجود.', 'Branch not found.', 'BRANCH_NOT_FOUND'));
        }
        // Merge repeated product lines so one receipt of 2+3 of the same title is
        // costed and logged once per unit total.
        const merged = new Map();
        for (const item of items) {
            const current = merged.get(item.productId) ?? { quantity: 0, unitCost: item.unitCost };
            current.quantity += item.quantity;
            merged.set(item.productId, current);
        }
        const products = await prisma.product.findMany({
            where: { tenantId, id: { in: [...merged.keys()] } },
            select: { id: true },
        });
        if (products.length !== merged.size) {
            return reply.code(404).send(invalid('بعض المنتجات غير موجودة في هذا المركز.', 'One or more products do not exist in your center.', 'PRODUCT_NOT_FOUND'));
        }
        const { costTotal } = computePurchaseCost([...merged.values()].map((v) => ({ quantity: v.quantity, unitCost: v.unitCost })));
        await prisma.$transaction(async (tx) => {
            for (const [productId, item] of merged) {
                const delta = computeStockDelta('PURCHASE', item.quantity);
                const moved = await applyStockMovement(tx, {
                    tenantId,
                    branchId,
                    productId,
                    type: 'PURCHASE',
                    delta,
                    quantity: item.quantity,
                    unitCost: new Prisma.Decimal(item.unitCost),
                    note: note ?? null,
                    createdById: request.user.sub,
                });
                if (!moved.ok) {
                    throw new Error('PURCHASE_CANNOT_FAIL');
                }
            }
            await recordAuditEntry({
                actorId: request.user.sub,
                tenantId: request.user.tenantId,
                shiftRegisterId: null,
                action: 'INVENTORY_PURCHASE_RECORDED',
                entityType: 'BRANCH_STOCK',
                entityId: branchId,
                metadata: { lineCount: merged.size, costTotal },
            }, tx);
        });
        return reply.code(201).send({ success: true, data: { costTotal } });
    });
    /** Stock count correction: the shelf is found to disagree with the ledger. */
    app.post('/adjustments', {
        preHandler: [authenticate, requireRoles(Role.ADMIN), requireTenantWritable, addon],
        schema: { body: adjustmentBodySchema },
    }, async (request, reply) => {
        const tenantId = request.user?.tenantId;
        if (!tenantId) {
            return reply.code(403).send(invalid('الحساب غير مرتبط بمركز تعليمي.', 'Account has no tenant assigned.', 'TENANT_CONTEXT_MISSING'));
        }
        const { branchId, productId, countedQuantity, note } = request.body;
        // Both parents are checked before the shelf is read. The read below is
        // tenant-scoped and would answer "quantity 0" for anything this center does
        // not own, which is indistinguishable from an empty shelf — so without these
        // two checks the route would report a real count against a stock row it had
        // just created for someone else's branch and product.
        if (!(await assertBranch(prisma, tenantId, branchId))) {
            return reply.code(404).send(invalid('الفرع غير موجود.', 'Branch not found.', 'BRANCH_NOT_FOUND'));
        }
        if (!(await assertProduct(prisma, tenantId, productId))) {
            return reply.code(404).send(invalid('المنتج غير موجود.', 'Product not found.', 'PRODUCT_NOT_FOUND'));
        }
        const current = await prisma.branchStock.findFirst({
            where: { branchId, productId, tenantId },
            select: { quantity: true },
        });
        let delta;
        try {
            delta = computeAdjustmentDelta(current?.quantity ?? 0, countedQuantity);
        }
        catch {
            return reply.code(400).send(invalid('الكمية المعدودة غير صالحة.', 'The counted quantity is invalid.'));
        }
        if (delta === 0) {
            // Nothing to record: the shelf already agrees with the ledger.
            return reply.send({ success: true, data: { changed: false, quantity: countedQuantity } });
        }
        try {
            await prisma.$transaction(async (tx) => {
                const moved = await applyStockMovement(tx, {
                    tenantId,
                    branchId,
                    productId,
                    type: 'ADJUSTMENT',
                    delta,
                    quantity: Math.abs(delta),
                    note: note ?? null,
                    createdById: request.user.sub,
                });
                if (!moved.ok) {
                    throw new Error('ADJUSTMENT_WOULD_GO_NEGATIVE');
                }
                await recordAuditEntry({
                    actorId: request.user.sub,
                    tenantId: request.user.tenantId,
                    shiftRegisterId: null,
                    action: 'INVENTORY_ADJUSTED',
                    entityType: 'BRANCH_STOCK',
                    entityId: branchId,
                    metadata: { productId, delta, countedQuantity },
                }, tx);
            });
        }
        catch (error) {
            if (error instanceof Error && error.message === 'ADJUSTMENT_WOULD_GO_NEGATIVE') {
                return reply.code(409).send(invalid('الكمية الحالية أقل من المحوّل، لا يمكن تسجيل العجز.', 'Stock is already lower than the counted figure; a shortfall cannot be recorded.', 'STOCK_INSUFFICIENT'));
            }
            if (error instanceof Error && error.message === 'STOCK_ROW_FOREIGN_TENANT') {
                return reply.code(409).send(stockRowConflict());
            }
            throw error;
        }
        return reply.send({ success: true, data: { changed: true, delta, quantity: countedQuantity } });
    });
    /** Damaged or lost stock leaves the shelf for good. */
    app.post('/write-offs', {
        preHandler: [authenticate, requireRoles(Role.ADMIN), requireTenantWritable, addon],
        schema: { body: writeOffBodySchema },
    }, async (request, reply) => {
        const tenantId = request.user?.tenantId;
        if (!tenantId) {
            return reply.code(403).send(invalid('الحساب غير مرتبط بمركز تعليمي.', 'Account has no tenant assigned.', 'TENANT_CONTEXT_MISSING'));
        }
        const { branchId, productId, quantity, note } = request.body;
        // Same two checks as an adjustment: a write-off is a stock movement, so it
        // can neither name a branch nor a product belonging to another center.
        if (!(await assertBranch(prisma, tenantId, branchId))) {
            return reply.code(404).send(invalid('الفرع غير موجود.', 'Branch not found.', 'BRANCH_NOT_FOUND'));
        }
        if (!(await assertProduct(prisma, tenantId, productId))) {
            return reply.code(404).send(invalid('المنتج غير موجود.', 'Product not found.', 'PRODUCT_NOT_FOUND'));
        }
        let delta;
        try {
            delta = computeStockDelta('WRITE_OFF', quantity);
        }
        catch {
            return reply.code(400).send(invalid('الكمية غير صالحة.', 'The quantity is invalid.'));
        }
        try {
            await prisma.$transaction(async (tx) => {
                const moved = await applyStockMovement(tx, {
                    tenantId,
                    branchId,
                    productId,
                    type: 'WRITE_OFF',
                    delta,
                    quantity,
                    note: note ?? null,
                    createdById: request.user.sub,
                });
                if (!moved.ok)
                    throw new Error('WRITE_OFF_EXCEEDS_STOCK');
                await recordAuditEntry({
                    actorId: request.user.sub,
                    tenantId: request.user.tenantId,
                    shiftRegisterId: null,
                    action: 'INVENTORY_WRITTEN_OFF',
                    entityType: 'BRANCH_STOCK',
                    entityId: branchId,
                    metadata: { productId, quantity },
                }, tx);
            });
        }
        catch (error) {
            if (error instanceof Error && error.message === 'WRITE_OFF_EXCEEDS_STOCK') {
                return reply.code(409).send(invalid('الكمية المتاحة غير كافية.', 'Not enough stock on hand.', 'STOCK_INSUFFICIENT'));
            }
            if (error instanceof Error && error.message === 'STOCK_ROW_FOREIGN_TENANT') {
                return reply.code(409).send(stockRowConflict());
            }
            throw error;
        }
        return reply.send({ success: true, data: { writtenOff: quantity } });
    });
    /**
     * Records a sale to a student.
     *
     * One transaction covers the sale header, its priced lines, the stock
     * decrements and the ledger rows: a sale cannot exist without its stock having
     * moved, and stock cannot move without a sale explaining it.
     *
     * The student's center is checked explicitly. The database cannot enforce it —
     * a foreign key only proves the student exists, not that they belong to this
     * center — so an unscoped `studentId` from another center would otherwise be a
     * valid sale.
     */
    app.post('/sales', {
        preHandler: [authenticate, requireTenantWritable, addon],
        schema: { body: saleBodySchema },
    }, async (request, reply) => {
        const tenantId = request.user?.tenantId;
        if (!tenantId) {
            return reply.code(403).send(invalid('الحساب غير مرتبط بمركز تعليمي.', 'Account has no tenant assigned.', 'TENANT_CONTEXT_MISSING'));
        }
        const { branchId, studentId, paymentMethod, note, items } = request.body;
        if (!(await assertBranch(prisma, tenantId, branchId))) {
            return reply.code(404).send(invalid('الفرع غير موجود.', 'Branch not found.', 'BRANCH_NOT_FOUND'));
        }
        // Tenant-scoped: this is the check that stops another center's student from
        // being billed here, which no foreign key would catch.
        const student = await prisma.student.findFirst({
            where: { id: studentId, tenantId },
            select: { id: true, fullName: true },
        });
        if (!student) {
            return reply.code(404).send(invalid('الطالب غير موجود في هذا المركز.', 'Student not found in your center.', 'STUDENT_NOT_FOUND'));
        }
        const products = await prisma.product.findMany({
            where: { tenantId, id: { in: [...new Set(items.map((i) => i.productId))] } },
            select: { id: true, nameAr: true, salePrice: true, costPrice: true, isActive: true },
        });
        if (products.length !== new Set(items.map((i) => i.productId)).size) {
            return reply.code(404).send(invalid('بعض المنتجات غير موجودة في هذا المركز.', 'One or more products do not exist in your center.', 'PRODUCT_NOT_FOUND'));
        }
        if (products.some((p) => !p.isActive)) {
            return reply.code(400).send(invalid('لا يمكن بيع منتج غير نشط.', 'An inactive product cannot be sold.'));
        }
        const priceById = new Map(products.map((p) => [p.id, p]));
        const lineInputs = items.map((item) => {
            const product = priceById.get(item.productId);
            return { productId: item.productId, quantity: item.quantity, unitPrice: product.salePrice, unitCost: product.costPrice };
        });
        const availableRows = await prisma.branchStock.findMany({
            where: { tenantId, branchId, productId: { in: [...new Set(items.map((i) => i.productId))] } },
            select: { productId: true, quantity: true },
        });
        const availableByProduct = new Map(availableRows.map((row) => [row.productId, row.quantity]));
        // Pre-flight so an obvious shortfall returns a helpful 409 naming the
        // products, instead of aborting halfway with a generic error. The
        // authoritative check is still the conditional update inside the
        // transaction, because stock can change between these two statements.
        const priced = computeSale(lineInputs, availableByProduct);
        if (!priced.ok) {
            const names = priced.shortfalls
                .map((s) => priceById.get(s.productId)?.nameAr ?? s.productId)
                .join('، ');
            return reply.code(409).send(invalid(`الكمية غير متوفرة لـ: ${names}`, `Not enough stock for: ${names}`, 'STOCK_INSUFFICIENT'));
        }
        try {
            const sale = await prisma.$transaction(async (tx) => {
                const created = await tx.bookSale.create({
                    data: {
                        tenantId,
                        branchId,
                        studentId,
                        total: new Prisma.Decimal(priced.sale.total),
                        costTotal: new Prisma.Decimal(priced.sale.costTotal),
                        paymentMethod: paymentMethod,
                        note: note ?? null,
                        createdById: request.user.sub,
                        lines: {
                            create: priced.sale.lines.map((line) => ({
                                productId: line.productId,
                                quantity: line.quantity,
                                unitPrice: new Prisma.Decimal(line.unitPrice),
                                unitCost: new Prisma.Decimal(line.unitCost),
                                lineTotal: new Prisma.Decimal(line.lineTotal),
                            })),
                        },
                    },
                });
                for (const line of priced.sale.lines) {
                    const moved = await applyStockMovement(tx, {
                        tenantId,
                        branchId,
                        productId: line.productId,
                        type: 'SALE',
                        delta: computeStockDelta('SALE', line.quantity),
                        quantity: line.quantity,
                        unitCost: new Prisma.Decimal(line.unitCost),
                        saleId: created.id,
                        createdById: request.user.sub,
                    });
                    if (!moved.ok) {
                        // Someone else took the last copy between the pre-flight and here.
                        // Throwing rolls the whole sale back rather than leaving a header
                        // for stock that never moved.
                        throw new Error('SALE_EXCEEDS_STOCK');
                    }
                }
                await recordAuditEntry({
                    actorId: request.user.sub,
                    tenantId: request.user.tenantId,
                    shiftRegisterId: null,
                    action: 'BOOK_SALE_RECORDED',
                    entityType: 'BOOK_SALE',
                    entityId: created.id,
                    metadata: { total: priced.sale.total, costTotal: priced.sale.costTotal, paymentMethod, lineCount: priced.sale.lines.length },
                }, tx);
                return created;
            });
            return reply.code(201).send({
                success: true,
                data: {
                    sale: {
                        id: sale.id,
                        studentId: sale.studentId,
                        branchId: sale.branchId,
                        status: sale.status,
                        total: Number(sale.total),
                        costTotal: Number(sale.costTotal),
                        profit: Math.round((Number(sale.total) - Number(sale.costTotal)) * 100) / 100,
                        paymentMethod: sale.paymentMethod,
                        createdAt: sale.createdAt.toISOString(),
                        lines: priced.sale.lines,
                    },
                },
            });
        }
        catch (error) {
            if (error instanceof Error && error.message === 'SALE_EXCEEDS_STOCK') {
                return reply.code(409).send(invalid('الكمية غير متوفرة، بعض الأصناف نفدت أثناء العملية.', 'Stock changed while the sale was being recorded; please retry.', 'STOCK_INSUFFICIENT'));
            }
            throw error;
        }
    });
    /**
     * Voids a sale by putting the stock back.
     *
     * The sale row is kept and marked VOIDED rather than deleted: it is a financial
     * record, and "this sale happened and was cancelled" is a fact the center needs
     * to be able to show. The reversal is written as RETURN movements, so the
     * ledger still accounts for the items leaving and coming back.
     */
    app.post('/sales/:id/void', {
        preHandler: [authenticate, requireRoles(Role.ADMIN), requireTenantWritable, addon],
        schema: {
            params: uuidParamsSchema,
            body: {
                type: 'object',
                required: ['reason'],
                additionalProperties: false,
                properties: { reason: { type: 'string', minLength: 1, maxLength: 300 } },
            },
        },
    }, async (request, reply) => {
        const tenantId = request.user?.tenantId;
        if (!tenantId) {
            return reply.code(403).send(invalid('الحساب غير مرتبط بمركز تعليمي.', 'Account has no tenant assigned.', 'TENANT_CONTEXT_MISSING'));
        }
        const existing = await prisma.bookSale.findFirst({
            where: { id: request.params.id, tenantId },
            include: { lines: { select: { productId: true, quantity: true } } },
        });
        if (!existing) {
            return reply.code(404).send(invalid('عملية البيع غير موجودة.', 'Sale not found.', 'BOOK_SALE_NOT_FOUND'));
        }
        if (existing.status === 'VOIDED') {
            return reply.code(409).send(invalid('هذه العملية مُلغاة بالفعل.', 'This sale has already been voided.', 'SALE_ALREADY_VOIDED'));
        }
        try {
            await prisma.$transaction(async (tx) => {
                const deltas = computeVoidDeltas(existing.lines);
                for (const line of deltas) {
                    const moved = await applyStockMovement(tx, {
                        tenantId,
                        branchId: existing.branchId,
                        productId: line.productId,
                        type: 'RETURN',
                        delta: line.delta,
                        quantity: line.quantity,
                        saleId: existing.id,
                        note: `VOID: ${request.body.reason}`,
                        createdById: request.user.sub,
                    });
                    if (!moved.ok)
                        throw new Error('VOID_RETURN_EXCEEDS_STOCK');
                }
                await tx.bookSale.update({
                    where: { id: existing.id, tenantId },
                    data: { status: 'VOIDED', voidedAt: new Date(), voidReason: request.body.reason.trim() },
                });
                await recordAuditEntry({
                    actorId: request.user.sub,
                    tenantId: request.user.tenantId,
                    shiftRegisterId: null,
                    action: 'BOOK_SALE_VOIDED',
                    entityType: 'BOOK_SALE',
                    entityId: existing.id,
                    metadata: { reason: request.body.reason, total: Number(existing.total) },
                }, tx);
            });
        }
        catch (error) {
            if (error instanceof Error && error.message === 'VOID_RETURN_EXCEEDS_STOCK') {
                return reply.code(409).send(invalid('لا يمكن إرجاع الكميات، الرصيد الحالي غير كافٍ.', 'Stock cannot absorb the reversal; the current balance is too low.', 'STOCK_INSUFFICIENT'));
            }
            throw error;
        }
        return reply.send({ success: true, data: { voided: true } });
    });
    /** Sales list, filterable by branch, student and period. */
    app.get('/sales', { preHandler: [authenticate, addon] }, async (request, reply) => {
        const tenantId = request.user?.tenantId;
        if (!tenantId) {
            return reply.code(403).send(invalid('الحساب غير مرتبط بمركز تعليمي.', 'Account has no tenant assigned.', 'TENANT_CONTEXT_MISSING'));
        }
        const q = request.query;
        const pagination = parsePagination(q);
        if (!pagination.ok)
            return reply.code(400).send(pagination.error);
        const { page, limit, skip } = pagination;
        const sales = await prisma.bookSale.findMany({
            // `branch: { tenantId }` for the same reason as in `/products`: a sale
            // stamped with this tenant but pointing at another center's branch is not
            // this center's sale, and must not be listed under that branch.
            where: {
                tenantId,
                branch: { tenantId },
                ...(q.branchId ? { branchId: String(q.branchId) } : {}),
                ...(q.studentId ? { studentId: String(q.studentId) } : {}),
                ...(q.from || q.to
                    ? {
                        createdAt: {
                            ...(q.from ? { gte: new Date(String(q.from)) } : {}),
                            ...(q.to ? { lte: new Date(String(q.to)) } : {}),
                        },
                    }
                    : {}),
            },
            include: {
                student: { select: { fullName: true } },
                branch: { select: { name: true } },
                lines: { select: { quantity: true, lineTotal: true, product: { select: { nameAr: true } } } },
            },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
        });
        return reply.send({
            success: true,
            data: {
                sales: sales.map((sale) => ({
                    id: sale.id,
                    studentName: sale.student.fullName,
                    branchName: sale.branch.name,
                    status: sale.status,
                    total: Number(sale.total),
                    costTotal: Number(sale.costTotal),
                    profit: Math.round((Number(sale.total) - Number(sale.costTotal)) * 100) / 100,
                    paymentMethod: sale.paymentMethod,
                    voidReason: sale.voidReason,
                    createdAt: sale.createdAt.toISOString(),
                    lines: sale.lines.map((line) => ({
                        productName: line.product.nameAr,
                        quantity: line.quantity,
                        lineTotal: Number(line.lineTotal),
                    })),
                })),
                pagination: { page, limit },
            },
        });
    });
    /** What one student has bought, for the reception desk and for reports. */
    app.get('/students/:studentId/purchases', {
        preHandler: [authenticate, addon],
        schema: { params: studentParamsSchema },
    }, async (request, reply) => {
        const tenantId = request.user?.tenantId;
        if (!tenantId) {
            return reply.code(403).send(invalid('الحساب غير مرتبط بمركز تعليمي.', 'Account has no tenant assigned.', 'TENANT_CONTEXT_MISSING'));
        }
        const student = await prisma.student.findFirst({
            where: { id: request.params.studentId, tenantId },
            select: { id: true, fullName: true },
        });
        if (!student) {
            return reply.code(404).send(invalid('الطالب غير موجود في هذا المركز.', 'Student not found in your center.', 'STUDENT_NOT_FOUND'));
        }
        const sales = await prisma.bookSale.findMany({
            where: { tenantId, studentId: student.id },
            include: {
                branch: { select: { name: true } },
                lines: { include: { product: { select: { nameAr: true } } } },
            },
            orderBy: { createdAt: 'desc' },
        });
        const summary = summarizeSales(sales, { from: new Date(0), to: new Date('2999-12-31') });
        return reply.send({
            success: true,
            data: {
                student,
                summary,
                sales: sales.map((sale) => ({
                    id: sale.id,
                    branchName: sale.branch.name,
                    status: sale.status,
                    total: Number(sale.total),
                    createdAt: sale.createdAt.toISOString(),
                    lines: sale.lines.map((line) => ({
                        productName: line.product.nameAr,
                        quantity: line.quantity,
                        unitPrice: Number(line.unitPrice),
                        lineTotal: Number(line.lineTotal),
                    })),
                })),
            },
        });
    });
    /**
     * Revenue, cost and profit over a period, plus what moved and what is running
     * low. Voided sales are excluded from the money but counted separately.
     */
    app.get('/reports', { preHandler: [authenticate, addon] }, async (request, reply) => {
        const tenantId = request.user?.tenantId;
        if (!tenantId) {
            return reply.code(403).send(invalid('الحساب غير مرتبط بمركز تعليمي.', 'Account has no tenant assigned.', 'TENANT_CONTEXT_MISSING'));
        }
        const q = request.query;
        const branchId = q.branchId ? String(q.branchId) : undefined;
        const now = new Date();
        const from = q.from ? new Date(String(q.from)) : new Date(now.getFullYear(), now.getMonth(), 1);
        const to = q.to ? new Date(String(q.to)) : now;
        if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
            return reply.code(400).send(invalid('الفترة الزمنية غير صالحة.', 'The reporting period is invalid.'));
        }
        const [sales, lowStock] = await Promise.all([
            prisma.bookSale.findMany({
                where: { tenantId, branch: { tenantId }, ...(branchId ? { branchId } : {}), createdAt: { gte: from, lte: to } },
                select: { status: true, total: true, costTotal: true, createdAt: true },
            }),
            prisma.branchStock.findMany({
                where: { tenantId, branch: { tenantId }, ...(branchId ? { branchId } : {}) },
                include: {
                    product: { select: { id: true, nameAr: true, costPrice: true } },
                    branch: { select: { name: true } },
                },
            }),
        ]);
        const summary = summarizeSales(sales, { from, to });
        const belowReorder = lowStock.filter((stock) => stock.quantity <= stock.reorderLevel);
        // What the shelves are worth at what the center paid for them. This is a
        // different figure from `summary.cost`, which is the cost of what was
        // actually sold in the period — unsold stock is not an expense yet.
        const stockValueAtCost = Math.round(lowStock.reduce((sum, stock) => sum + stock.quantity * Number(stock.product.costPrice), 0) * 100) / 100;
        return reply.send({
            success: true,
            data: {
                period: { from: from.toISOString(), to: to.toISOString() },
                summary,
                lowStock: belowReorder.map((stock) => ({
                    productId: stock.product.id,
                    productName: stock.product.nameAr,
                    branchName: stock.branch.name,
                    quantity: stock.quantity,
                    reorderLevel: stock.reorderLevel,
                })),
                stockValueAtCost,
            },
        });
    });
    /** The raw movement ledger for one branch/product, for auditing a shelf. */
    app.get('/movements', { preHandler: [authenticate, addon] }, async (request, reply) => {
        const tenantId = request.user?.tenantId;
        if (!tenantId) {
            return reply.code(403).send(invalid('الحساب غير مرتبط بمركز تعليمي.', 'Account has no tenant assigned.', 'TENANT_CONTEXT_MISSING'));
        }
        const q = request.query;
        const pagination = parsePagination(q);
        if (!pagination.ok)
            return reply.code(400).send(pagination.error);
        const { page, limit, skip } = pagination;
        const movements = await prisma.stockMovement.findMany({
            where: {
                tenantId,
                branch: { tenantId },
                ...(q.branchId ? { branchId: String(q.branchId) } : {}),
                ...(q.productId ? { productId: String(q.productId) } : {}),
                ...(q.type ? { type: String(q.type) } : {}),
            },
            include: { product: { select: { nameAr: true } }, branch: { select: { name: true } } },
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
        });
        return reply.send({
            success: true,
            data: {
                movements: movements.map((m) => ({
                    id: m.id,
                    type: m.type,
                    productName: m.product.nameAr,
                    branchName: m.branch.name,
                    quantity: m.quantity,
                    delta: m.delta,
                    unitCost: m.unitCost === null ? null : Number(m.unitCost),
                    note: m.note,
                    createdAt: m.createdAt.toISOString(),
                })),
                pagination: { page, limit },
            },
        });
    });
};
export default inventoryRoutes;
