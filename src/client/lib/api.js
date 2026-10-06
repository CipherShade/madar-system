export async function api(path, options) {
    const response = await fetch(`/api${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...options?.headers } });
    const body = await response.json();
    if (!response.ok) {
        const error = new Error(body.error?.message || body.error?.messageEn || 'Request failed');
        error.code = body.error?.code;
        throw error;
    }
    return body.data;
}
export const money = (value, locale = 'ar-EG') => {
    const amount = Number(value ?? 0);
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number.isFinite(amount) ? amount : 0);
};
