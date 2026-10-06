import { createHmac, timingSafeEqual } from 'node:crypto';
const base64PaddingRE = /=/g;
/** Mirror of @fastify/cookie's `sign`: `value.signature` with base64 padding removed. */
export function signCookieValue(value, secret) {
    return `${value}.${createHmac('sha256', secret).update(value).digest('base64').replace(base64PaddingRE, '')}`;
}
/** Mirror of @fastify/cookie's `unsign` using constant-time comparison. */
export function unsignCookieValue(signedValue, secret) {
    if (typeof signedValue !== 'string' || signedValue.length === 0)
        return null;
    const dotIndex = signedValue.lastIndexOf('.');
    if (dotIndex <= 0 || dotIndex === signedValue.length - 1)
        return null;
    const value = signedValue.slice(0, dotIndex);
    const actual = Buffer.from(signedValue.slice(dotIndex + 1));
    const expected = Buffer.from(createHmac('sha256', secret).update(value).digest('base64').replace(base64PaddingRE, ''));
    if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
        return value;
    }
    return null;
}
/** Extract a cookie value from a raw Cookie header (no decoding). */
export function extractCookieHeader(cookieHeader, cookieName) {
    if (!cookieHeader)
        return undefined;
    const escaped = cookieName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`));
    return match ? match[1] : undefined;
}
/** Converges `'12h'`, `'30m'`, `'1d'`, `'900'` JSON token syntax to seconds (default 12h). */
export function parseJwtExpiresInSeconds(value) {
    const trimmed = (value ?? '').trim();
    const match = trimmed.match(/^(\d+)\s*([smhdw])?$/i);
    if (!match)
        return 43200;
    const amount = Number(match[1]);
    const unit = (match[2] || 's').toLowerCase();
    const multipliers = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
    const multiplier = multipliers[unit];
    return Math.max(1, Math.round(amount * multiplier));
}
/**
 * In-memory fixed-window rate limiter. Per-process only; pair with a shared
 * store (e.g. Redis) when running multiple instances.
 */
export function createRateLimiter(options) {
    const store = new Map();
    return async function rateLimiter(request, reply) {
        const now = Date.now();
        const key = options.keyBy ? options.keyBy(request) : request.user?.sub ?? request.ip;
        const entry = store.get(key);
        if (!entry || entry.resetAt <= now) {
            store.set(key, { count: 1, resetAt: now + options.windowMs });
            return;
        }
        entry.count += 1;
        if (entry.count > options.max) {
            await reply.code(429).send({
                success: false,
                error: {
                    code: 'RATE_LIMITED',
                    message: 'طلبات كثيرة جداً، يرجى المحاولة بعد قليل.',
                    messageEn: 'Too many requests. Please try again later.',
                },
            });
        }
    };
}
export function buildRateLimiters(rules) {
    return {
        login: createRateLimiter(rules.login),
        checkIn: createRateLimiter(rules.checkIn),
        studentSearch: createRateLimiter(rules.studentSearch),
        financial: createRateLimiter(rules.financial),
    };
}
function normalizeAuthority(value) {
    const withoutScheme = value.replace(/^https?:\/\//i, '');
    const port = withoutScheme.match(/:(\d+)$/);
    return port ? `${withoutScheme.slice(0, withoutScheme.length - port[0].length)}:${port[1]}` : withoutScheme;
}
function isSameOriginRequest(origin, hostHeader) {
    const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
    if (!host)
        return false;
    try {
        const url = new URL(origin);
        if (url.protocol !== 'http:' && url.protocol !== 'https:')
            return false;
        return normalizeAuthority(url.host) === normalizeAuthority(host);
    }
    catch {
        return false;
    }
}
/**
 * CSRF defense-in-depth on top of the SameSite=Lax cookie: once CSRF is
 * SameSite=Lax it is already safe, this blocks the remaining cross-site
 * vectors (e.g. older browsers / non-cookie flows) by rejecting state-changing
 * requests whose Origin is neither same-origin nor a configured trust origin.
 */
export function createCsrfOriginGuard(allowedOrigins) {
    return async function csrfOriginGuard(request, reply) {
        if (request.method === 'GET' || request.method === 'HEAD' || request.method === 'OPTIONS')
            return;
        const origin = request.headers.origin;
        if (typeof origin !== 'string' || origin.length === 0)
            return;
        if (isSameOriginRequest(origin, request.headers.host))
            return;
        if (allowedOrigins.includes(origin))
            return;
        await reply.code(403).send({
            success: false,
            error: {
                code: 'CSRF_ORIGIN_BLOCKED',
                message: 'تم رفض الطلب بسبب مصدر غير موثوق.',
                messageEn: 'The request was rejected because of an untrusted origin.',
            },
        });
    };
}
