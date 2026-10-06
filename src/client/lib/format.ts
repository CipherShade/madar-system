export const EGYPTIAN_MOBILE = /^(010|011|012|015)[0-9]{8}$/;

export function formatMoney(value: number, language: string): string {
  const amount = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat(language === 'en' ? 'en-EG' : 'ar-EG', {
    style: 'currency',
    currency: 'EGP',
  })
    .format(amount)
    .replace(/\u00a0/g, ' ');
}

export function formatDate(value: string | Date, language: string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return typeof value === 'string' ? value : '';
  return date.toLocaleString(language === 'en' ? 'en-GB' : 'ar-EG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
