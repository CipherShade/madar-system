/**
 * Centralized single source of truth for the Madar subscription.
 *
 * Madar is sold as one product. There are no tiers, and a paid center is not
 * capped: it may add as many receptionists, branches and reception desks as it
 * has staff for, and may record as many visits per month as it can serve.
 *
 * The EGP 1,999 list price is presentation only. It exists so the current price
 * can be shown as a real reduction, and it is never a second price that anyone
 * is charged — the single amount a center is ever billed for the platform itself
 * is MONTHLY_PRICE_EGP.
 *
 * Optional capabilities are sold as recurring add-ons on top of that one price
 * (see BILLABLE_ADDONS below). An add-on does not create a second product or a
 * tier; it is an extra line on the same single invoice.
 */
export const SUBSCRIPTION_CURRENCY = 'EGP';
/** The one and only monthly price, in EGP. */
export const MONTHLY_PRICE_EGP = 1199;
/**
 * Length of the free trial a new center starts on, in days. A trial is not a
 * plan and carries no limits: it is simply the window before the center must
 * subscribe.
 */
export const TRIAL_DAYS = 14;
// ─── Paid add-ons ────────────────────────────────────────────────────────────
/**
 * Identifier of the Books & Inventory add-on. It matches the `AddonCode` enum in
 * the Prisma schema, which is why it is written out as a literal constant rather
 * than imported: this file is loaded by the client bundle too, and the schema is
 * not.
 */
export const BOOKS_INVENTORY_ADDON = 'BOOKS_INVENTORY';
/** Every add-on that can be billed, in the order shown on an invoice. */
export const BILLABLE_ADDONS = [BOOKS_INVENTORY_ADDON];
/**
 * Monthly price of each add-on, in EGP, on top of MONTHLY_PRICE_EGP.
 *
 * An add-on is a recurring line item, not a one-off: a center that keeps it
 * enabled is charged EGP 300 every month alongside the base price. Enabling or
 * cancelling one takes effect on the *next* invoice rather than being prorated
 * against the current period, because prorating a 300 EGP line item would mean
 * crediting fractions of a pound and then reconciling them by hand.
 */
export const ADDON_MONTHLY_PRICE_EGP = {
    [BOOKS_INVENTORY_ADDON]: 300,
};
/** English invoice labels, frozen into the line-item snapshot when invoiced. */
export const ADDON_LABEL_EN = {
    [BOOKS_INVENTORY_ADDON]: 'Books & Inventory',
};
/** Arabic invoice labels. */
export const ADDON_LABEL_AR = {
    [BOOKS_INVENTORY_ADDON]: 'الكتب والمخزون',
};
/** The base platform line, which is always present on an invoice. */
export const BASE_LINE_CODE = 'BASE';
export const BASE_LINE_LABEL_EN = 'Madar Platform';
export const BASE_LINE_LABEL_AR = 'منصة مدار';
/** Convenience: what a center pays per month with a given set of add-ons. */
export function totalMonthlyPriceEgp(addons = []) {
    const addonTotal = addons.reduce((sum, code) => sum + ADDON_MONTHLY_PRICE_EGP[code], 0);
    return MONTHLY_PRICE_EGP + addonTotal;
}
