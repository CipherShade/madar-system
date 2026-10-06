import { prisma } from './prisma.js';
import { BOOKS_INVENTORY_ADDON } from '../../shared/constants/subscription.js';
/**
 * Paid add-on entitlements.
 *
 * An add-on is a capability the center bought on top of the single platform
 * subscription. Nothing here decides *whether a center may write at all* — that
 * is requireTenantWritable's job — this only decides whether a specific paid
 * feature is switched on for this center.
 *
 * The two guards are independent on purpose. A frozen center must still be able
 * to read its add-on state (to render a "contact us to renew" screen), and a
 * center whose subscription is healthy must still be refused inventory routes it
 * never paid for.
 *
 * A missing row means "not enabled". No row is written when a center signs up,
 * so the default for every existing and future center is the feature switched
 * off, which is the safe direction: nobody receives a paid capability by
 * accident because of a join that happened to match.
 */
export const ADDON_MESSAGES = {
    [BOOKS_INVENTORY_ADDON]: {
        messageAr: 'إضافة الكتب والمخزون غير مفعلة لهذا المركز. تواصل معنا لتفعيلها.',
        messageEn: 'The Books & Inventory add-on is not enabled for your center. Contact us to activate it.',
    },
};
/** Codes the catalog can bill today; used to validate an incoming enable request. */
export const ENABLEABLE_ADDONS = [BOOKS_INVENTORY_ADDON];
let readerOverride = null;
/**
 * The add-on codes currently enabled for a center.
 *
 * Unknown codes stored in the database are ignored rather than surfaced: a code
 * from a future or retired catalog version must not make this return something
 * the pricing table cannot honour.
 */
export async function loadEnabledAddons(tenantId) {
    if (readerOverride)
        return (await readerOverride(tenantId)).filter(isKnownAddon);
    const rows = await prisma.tenantAddon.findMany({
        where: { tenantId, enabled: true },
        select: { code: true },
    });
    return rows.map((row) => row.code).filter(isKnownAddon);
}
export function isKnownAddon(code) {
    return ENABLEABLE_ADDONS.includes(code);
}
/** True when the center may use this paid feature right now. */
export async function isAddonEnabled(tenantId, code) {
    const enabled = await loadEnabledAddons(tenantId);
    return enabled.includes(code);
}
/**
 * Replaces the entitlement lookup, for tests. Pass null to restore the real one.
 *
 * The route modules have no database in the unit suite, so without this the
 * guard could only be tested by reading its source.
 */
export function setAddonReaderForTests(fn) {
    readerOverride = fn;
}
/** Reader bound to a transaction, so a sale can check and write atomically. */
export function addonReaderFor(db) {
    return async (tenantId) => {
        const rows = await db.tenantAddon.findMany({
            where: { tenantId, enabled: true },
            select: { code: true },
        });
        return rows.map((row) => row.code).filter(isKnownAddon);
    };
}
/**
 * Route guard: refuses the request with 403 ADDON_NOT_ENABLED unless the center
 * has paid for this add-on.
 *
 * Place it after `authenticate` (it reads request.user) and after
 * `requireTenantWritable` for writes, so a frozen center gets the more urgent
 * "your center is frozen" message rather than being told to buy a feature.
 */
export function requireAddon(code) {
    return async function addonGuard(request, reply) {
        const tenantId = request.user?.tenantId;
        if (!tenantId) {
            return reply.code(403).send({
                success: false,
                error: {
                    code: 'TENANT_CONTEXT_MISSING',
                    message: 'هذا الطلب غير مرتبط بمركز مسجل. يرجى تسجيل الدخول مرة أخرى.',
                    messageEn: 'This request is not scoped to a registered center. Please sign in again.',
                },
            });
        }
        if (await isAddonEnabled(tenantId, code))
            return;
        const copy = ADDON_MESSAGES[code];
        return reply.code(403).send({
            success: false,
            error: {
                code: 'ADDON_NOT_ENABLED',
                message: copy.messageAr,
                messageEn: copy.messageEn,
                details: { addon: code },
            },
        });
    };
}
