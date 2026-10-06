import { randomBytes } from 'node:crypto';
import { parseJwtExpiresInSeconds } from '../lib/security.js';
const nodeEnv = process.env.NODE_ENV || 'development';
// A fallback secret is a last resort for local development only. It must never be
// a hardcoded constant: a secret that ships in the source is a secret everyone
// has, and it is what signs every session token. So when one is not configured we
// generate a random one for this process. Consequences are then safe rather than
// catastrophic: a misconfigured deployment gets tokens nobody else can forge
// (they all die on restart) instead of tokens anyone can forge.
const randomSecret = (label) => `${label}-${randomBytes(32).toString('hex')}`;
const jwtSecret = process.env.JWT_SECRET || randomSecret('dev-jwt');
const cookieSecret = process.env.COOKIE_SECRET || randomSecret('dev-cookie');
if (nodeEnv === 'production' && (!process.env.DATABASE_URL || !process.env.JWT_SECRET || !process.env.COOKIE_SECRET || !process.env.CORS_ORIGIN)) {
    throw new Error('DATABASE_URL, JWT_SECRET, COOKIE_SECRET, and CORS_ORIGIN are required in production.');
}
if (nodeEnv !== 'production') {
    if (!process.env.JWT_SECRET) {
        console.warn('[security] JWT_SECRET is not set; generated a random secret for this process. Sessions will not survive a restart. Set a strong random secret in every real environment.');
    }
    if (!process.env.COOKIE_SECRET) {
        console.warn('[security] COOKIE_SECRET is not set; generated a random secret for this process. Signed cookies will not survive a restart. Set a strong random secret in every real environment.');
    }
    if (!process.env.DATABASE_URL) {
        console.warn('[config] DATABASE_URL is not set; using the local development PostgreSQL default.');
    }
}
function positiveInt(value, fallback) {
    if (value === undefined || value.trim() === '')
        return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 1 ? Math.round(parsed) : fallback;
}
export const config = {
    port: Number(process.env.PORT) || 3000,
    nodeEnv,
    databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/edu_center_erp?schema=public',
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
    sessionCookieMaxAgeSeconds: parseJwtExpiresInSeconds(process.env.JWT_EXPIRES_IN || '12h'),
    cookieSecret,
    // Surfaced so a deployment can be checked at a glance, and asserted in tests:
    // a generated secret is safe but not durable, so it must never be what a real
    // environment is running on.
    usingGeneratedJwtSecret: !process.env.JWT_SECRET,
    usingGeneratedCookieSecret: !process.env.COOKIE_SECRET,
    isDemoSeedDisabled: nodeEnv === 'production',
    corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    defaultLocale: process.env.DEFAULT_LOCALE || 'ar',
    bodyLimitBytes: positiveInt(process.env.REQUEST_BODY_LIMIT_KB, 64) * 1024,
    socketMaxPayloadBytes: positiveInt(process.env.SOCKET_MAX_PAYLOAD_KB, 64) * 1024,
    rateLimiting: {
        login: {
            windowMs: positiveInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MS, 60_000),
            max: positiveInt(process.env.RATE_LIMIT_LOGIN_MAX, 10),
        },
        checkIn: {
            windowMs: positiveInt(process.env.RATE_LIMIT_CHECKIN_WINDOW_MS, 60_000),
            max: positiveInt(process.env.RATE_LIMIT_CHECKIN_MAX, 240),
        },
        studentSearch: {
            windowMs: positiveInt(process.env.RATE_LIMIT_SEARCH_WINDOW_MS, 60_000),
            max: positiveInt(process.env.RATE_LIMIT_SEARCH_MAX, 240),
        },
        financial: {
            windowMs: positiveInt(process.env.RATE_LIMIT_FINANCIAL_WINDOW_MS, 60_000),
            max: positiveInt(process.env.RATE_LIMIT_FINANCIAL_MAX, 60),
        },
    },
};
