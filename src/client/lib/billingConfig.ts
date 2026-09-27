/**
 * Manual configuration for subscription payments (owner-maintained).
 *
 * These are the accounts the center's owner receives subscription fees on.
 * Replace them with the real accounts before going live — they cannot be
 * read from anywhere else in the codebase. Payment is manual (INSTAPAY at
 * signup; CASH / VODAFONE_CASH / INSTAPAY for later upgrades); there is no
 * online gateway — the tenant's Instapay account name is used as proof of
 * payment instead of an automated verification.
 */
export const billingConfig = {
  currency: 'EGP' as const,
  paymentAccounts: {
    VODAFONE_CASH: { accountNumber: '01012345678', displayName: 'فودافون كاش' },
    INSTAPAY: {
      accountNumber: 'youssefahmed.telda@instapay',
      displayName: 'إنستاباي',
      paymentLink: 'https://ipn.eg/S/youssefahmed.telda/instapay/21hndU',
    },
    CASH: { accountNumber: null, displayName: 'كاش (يدوي)' },
  },
};