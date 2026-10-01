/**
 * Centralized single source of truth for the Madar subscription.
 *
 * Madar is sold as one product. There are no tiers, and a paid center is not
 * capped: it may add as many receptionists, branches and reception desks as it
 * has staff for, and may record as many visits per month as it can serve.
 *
 * The EGP 1,999 list price is presentation only. It exists so the current price
 * can be shown as a real reduction, and it is never a second price that anyone
 * is charged — the single amount a center is ever billed is MONTHLY_PRICE_EGP.
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
