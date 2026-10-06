export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 30;
export const MAX_AUDIT_LIMIT = 500;
export const DEFAULT_AUDIT_LIMIT = 100;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY_RE = /^\d+(\.\d{1,2})?$/;
export function isValidUUID(value) {
    return UUID_RE.test(value);
}
/**
 * JSON Schema for the params object of a `/:id` route.
 *
 * Declaring the id in the schema rather than only re-checking it inside the
 * handler matters for ordering: Fastify validates before `preHandler` runs, so a
 * malformed id is rejected without reaching the tenant lifecycle guard or
 * touching the database at all. Keep the in-handler `isValidUUID` check too —
 * it is defence in depth, and it is what produces the 400 for a body-less route
 * if the schema is ever dropped.
 *
 * Note this is the *params object* schema, so routes use it as
 * `schema: { params: uuidParamsSchema }`.
 */
export const uuidParamsSchema = {
    type: 'object',
    properties: { id: { type: 'string', format: 'uuid' } },
    required: ['id'],
};
export function isValidMoneyAmount(value) {
    return Number.isFinite(value) && value >= 0 && MONEY_RE.test(String(value));
}
export function validationError(message, messageEn, code = 'VALIDATION_ERROR', details) {
    return { success: false, error: { code, message, messageEn, ...(details ? { details } : {}) } };
}
export function parsePagination(query) {
    const hasPage = query.page !== undefined && query.page !== null && query.page !== '';
    const hasLimit = query.limit !== undefined && query.limit !== null && query.limit !== '';
    const rawPage = Number(query.page);
    const rawLimit = Number(query.limit);
    if (hasPage && (!Number.isInteger(rawPage) || rawPage < 1)) {
        return { ok: false, error: validationError('معامل الصفحة غير صالح، يجب أن يكون رقماً صحيحاً موجباً.', 'The page parameter must be a positive integer.') };
    }
    if (hasLimit && (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_PAGE_SIZE)) {
        return { ok: false, error: validationError(`حد النتائج يجب أن يكون رقماً صحيحاً بين 1 و ${MAX_PAGE_SIZE}.`, `The limit must be an integer between 1 and ${MAX_PAGE_SIZE}.`) };
    }
    const page = hasPage ? rawPage : 1;
    const limit = hasLimit ? rawLimit : DEFAULT_PAGE_SIZE;
    return { ok: true, page, limit, skip: (page - 1) * limit };
}
export function parseAuditPagination(query) {
    const hasPage = query.page !== undefined && query.page !== null && query.page !== '';
    const hasLimit = query.limit !== undefined && query.limit !== null && query.limit !== '';
    const rawPage = Number(query.page);
    const rawLimit = Number(query.limit);
    if (hasPage && (!Number.isInteger(rawPage) || rawPage < 1)) {
        return { ok: false, error: validationError('معامل الصفحة غير صالح، يجب أن يكون رقماً صحيحاً موجباً.', 'The page parameter must be a positive integer.') };
    }
    if (hasLimit && (!Number.isInteger(rawLimit) || rawLimit < 1)) {
        return { ok: false, error: validationError(`حد النتائج يجب أن يكون رقماً صحيحاً موجباً في حد أقصى ${MAX_AUDIT_LIMIT}.`, `The limit must be a positive integer up to ${MAX_AUDIT_LIMIT}.`) };
    }
    const page = hasPage ? rawPage : 1;
    const limit = hasLimit ? Math.min(rawLimit, MAX_AUDIT_LIMIT) : DEFAULT_AUDIT_LIMIT;
    let from;
    let to;
    if (query.from !== undefined && query.from !== '') {
        const d = new Date(query.from);
        if (Number.isNaN(d.getTime()))
            return { ok: false, error: validationError('تاريخ البداية (from) غير صحيح.', 'The start date (from) is invalid.') };
        from = d;
    }
    if (query.to !== undefined && query.to !== '') {
        const d = new Date(query.to);
        if (Number.isNaN(d.getTime()))
            return { ok: false, error: validationError('تاريخ النهاية (to) غير صحيح.', 'The end date (to) is invalid.') };
        to = d;
    }
    if (from && to && from > to) {
        return { ok: false, error: validationError('يجب أن تكون النهاية بعد البداية.', 'The end date must be after the start date.') };
    }
    return { ok: true, page, limit, skip: (page - 1) * limit, from, to };
}
