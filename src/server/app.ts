import Fastify, { FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { Prisma } from '@prisma/client';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config/index.js';
import { prisma } from './lib/prisma.js';
import { buildRateLimiters, createCsrfOriginGuard } from './lib/security.js';
import type { RateLimitOverrides } from './lib/security.js';
import authRoutes from './modules/auth/auth.js';
import managementRoutes from './modules/management/management.js';
import schedulingRoutes from './modules/scheduling/scheduling.js';
import studentRoutes from './modules/students/students.js';
import shiftRoutes from './modules/shifts/shifts.js';
import attendanceRoutes from './modules/attendances/attendances.js';
import reconciliationRoutes from './modules/reconciliation/reconciliation.js';
import settlementRoutes from './modules/settlements/settlements.js';
import reportRoutes from './modules/reports/reports.js';
import userRoutes from './modules/users/users.js';
import branchRoutes from './modules/management/branches.js';
import subscriptionRoutes from './modules/subscriptions/subscriptions.js';
import publicPricingRoutes from './modules/subscriptions/publicPricing.js';
import adminRoutes from './modules/admin/admin.js';
import platformOpsRoutes from './modules/admin/platformOps.js';
import platformUsersRoutes from './modules/admin/platformUsers.js';
import platformUsageRoutes from './modules/admin/platformUsage.js';
import platformBillingRoutes from './modules/admin/platformBilling.js';

const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["set-cookie"]',
  'password',
  'passwordHash',
  'access_token',
  'authorization',
];

const NOT_FOUND_BODY = {
  success: false,
  error: {
    code: 'NOT_FOUND',
    message: 'الرابط المطلوب غير موجود.',
    messageEn: 'The requested endpoint was not found.',
  },
};

export type BuildAppOptions = {
  rateLimit?: RateLimitOverrides;
};

export function buildApp(options?: BuildAppOptions): FastifyInstance {
  const overrides = options ?? {};
  const app = Fastify({
    logger: {
      level: config.nodeEnv === 'development' ? 'debug' : 'info',
      redact: {
        paths: REDACT_PATHS,
        censor: '[REDACTED]',
      },
    },
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      const existing = Array.isArray(incoming) ? incoming[0] : incoming;
      return existing || randomUUID();
    },
    bodyLimit: config.bodyLimitBytes,
  });

  app.addHook('onResponse', async (request, reply) => {
    request.log.info({ statusCode: reply.statusCode }, 'request completed');
  });

  app.decorate('rateLimit', buildRateLimiters({
    login: { ...config.rateLimiting.login, ...overrides.rateLimit?.login },
    checkIn: { ...config.rateLimiting.checkIn, ...overrides.rateLimit?.checkIn },
    studentSearch: { ...config.rateLimiting.studentSearch, ...overrides.rateLimit?.studentSearch },
    financial: { ...config.rateLimiting.financial, ...overrides.rateLimit?.financial },
  }));

  // 1. Register CORS for the Vite frontend (comma-separated origins allowed)
  app.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
  });

  // 2. Register Cookie parser for HTTP-only JWT sessions
  app.register(cookie, {
    secret: config.cookieSecret,
  });

  app.register(jwt, {
    secret: config.jwtSecret,
    cookie: {
      cookieName: 'access_token',
      signed: true,
    },
    sign: {
      expiresIn: config.jwtExpiresIn,
    },
  });

  // 3. CSRF defense-in-depth: reject state-changing requests with an untrusted Origin
  app.addHook('preHandler', createCsrfOriginGuard(config.corsOrigins));

  app.register(authRoutes, { prefix: '/api/auth' });
  app.register(managementRoutes, { prefix: '/api/management' });
  app.register(schedulingRoutes, { prefix: '/api/scheduling' });
  app.register(studentRoutes, { prefix: '/api/registry' });
  app.register(shiftRoutes, { prefix: '/api/shifts' });
  app.register(attendanceRoutes, { prefix: '/api/attendances' });
  app.register(reconciliationRoutes, { prefix: '/api' });
  app.register(settlementRoutes, { prefix: '/api' });
  app.register(reportRoutes, { prefix: '/api/reports' });
  app.register(userRoutes, { prefix: '/api/users' });
  app.register(branchRoutes, { prefix: '/api/branches' });
  app.register(subscriptionRoutes, { prefix: '/api/subscriptions' });
  app.register(publicPricingRoutes, { prefix: '/api' });
  app.register(adminRoutes, { prefix: '/api/admin' });
  app.register(platformOpsRoutes, { prefix: '/api/admin' });
  app.register(platformUsersRoutes, { prefix: '/api/admin' });
  app.register(platformUsageRoutes, { prefix: '/api/admin' });
  app.register(platformBillingRoutes, { prefix: '/api/admin' });

  if (config.nodeEnv === 'production') {
    app.register(fastifyStatic, { root: path.join(process.cwd(), 'dist'), wildcard: false });
    app.get('/*', async (request, reply) => {
      if (request.url === '/api' || request.url.startsWith('/api/')) {
        request.log.info({ url: request.url, method: request.method }, 'api route not found');
        return reply.code(404).send(NOT_FOUND_BODY);
      }
      return reply.sendFile('index.html');
    });
  }

  // Setup demo database endpoint
  app.all('/api/setup-demo', async (request, reply) => {
    try {
      const { execSync } = await import('node:child_process');
      const { seedDemoData } = await import('./lib/demoSeed.js');
      try {
        execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
      } catch (pushErr) {
        request.log.warn({ err: pushErr }, 'db push note in setup-demo');
      }
      await seedDemoData(prisma);
      return { success: true, message: 'Database migrated and demo data seeded successfully!' };
    } catch (err: any) {
      request.log.error({ err }, 'setup-demo failed');
      return reply.code(500).send({ success: false, error: err?.message || String(err) });
    }
  });

  // 4. Health check endpoint
  app.get('/api/health', async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { success: true, data: { status: 'ok', database: 'ok', system: 'Educational Center ERP', environment: config.nodeEnv, defaultLocale: config.defaultLocale, timestamp: new Date().toISOString() } };
    } catch {
      return reply.code(503).send({ success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'قاعدة البيانات غير متاحة حالياً.', messageEn: 'The database is currently unavailable.' } });
    }
  });

  // 5. Global Error Handler with Arabic & English responses
  app.setNotFoundHandler((request, reply) => {
    request.log.info({ url: request.url, method: request.method }, 'route not found');
    return reply.code(404).send(NOT_FOUND_BODY);
  });

  app.setErrorHandler(async (error, request, reply) => {
    // Fastify schema validation failures
    if (error.validation) {
      const fields = (error.validation as { instancePath: string }[])
        .map((validation) => validation.instancePath)
        .filter(Boolean);
      return reply.status(400).send({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'بيانات الإدخال غير صالحة، يرجى التحقق من القيم المُرسلة.',
          messageEn: 'The submitted data is invalid.',
          ...(fields.length ? { details: { fields } } : {}),
        },
      });
    }

    // Prisma known request errors -> consistent HTTP status codes
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      request.log.error({ err: error, prismaCode: error.code }, 'prisma request error');
      switch (error.code) {
        case 'P2025':
          return reply.status(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'السجل المطلوب غير موجود.', messageEn: 'The requested record was not found.' } });
        case 'P2002':
          return reply.status(409).send({ success: false, error: { code: 'DUPLICATE_RECORD', message: 'هذا السجل موجود مسبقاً بقيمة فريدة مكررة.', messageEn: 'A record with this unique value already exists.' } });
        case 'P2003':
          return reply.status(409).send({ success: false, error: { code: 'FOREIGN_KEY_CONSTRAINT', message: 'السجل مرتبط ببيانات أخرى ولا يمكن تعديله أو حذفه.', messageEn: 'This record is referenced by other data.' } });
        case 'P2000':
          return reply.status(400).send({ success: false, error: { code: 'VALUE_TOO_LONG', message: 'القيمة المُرسلة أطول من الحد المسموح.', messageEn: 'The submitted value is too long.' } });
        case 'P2018':
          return reply.status(400).send({ success: false, error: { code: 'MISSING_RELATION', message: 'أحد السجلات المرتبطة غير موجود.', messageEn: 'A related record was not found.' } });
        case 'P2028':
          return reply.status(500).send({ success: false, error: { code: 'TRANSACTION_FAILED', message: 'فشلت العملية الحالية، يرجى المحاولة مرة أخرى.', messageEn: 'The current operation failed. Please try again.' } });
        case 'P2034':
          return reply.status(409).send({ success: false, error: { code: 'TRANSACTION_CONFLICT', message: 'تعارض في المعاملة، يرجى المحاولة مرة أخرى.', messageEn: 'The transaction conflicted. Please retry.' } });
        default:
          break;
      }
    }

    if (error instanceof Prisma.PrismaClientValidationError) {
      request.log.error({ err: error }, 'prisma validation error');
      return reply.status(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'بيانات غير صالحة.', messageEn: 'The submitted data is invalid.' } });
    }
    if (error instanceof Prisma.PrismaClientUnknownRequestError) {
      request.log.error({ err: error }, 'prisma unknown error');
      return reply.status(500).send({ success: false, error: { code: 'TRANSACTION_FAILED', message: 'فشلت العملية الحالية.', messageEn: 'The current operation failed.' } });
    }

    request.log.error({ err: error }, 'unhandled error');
    const statusCode = Number.isInteger(error.statusCode) && error.statusCode && error.statusCode >= 400 && error.statusCode < 600 ? error.statusCode : 500;

    if (statusCode >= 500) {
      try {
        await prisma.systemHealthEvent.create({
          data: {
            level: 'CRITICAL',
            category: 'api.error',
            message: `${request.method} ${request.url} — ${error.message}`.slice(0, 1000),
            meta: { statusCode, method: request.method, url: request.url, requestId: request.id },
          },
        });
      } catch (healthError) {
        request.log.error({ err: healthError }, 'failed to record system health event');
      }
    }

    reply.status(statusCode).send({
      success: false,
      error: {
        code: statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : (error.code || 'REQUEST_ERROR'),
        message: statusCode >= 500 ? 'حدث خطأ داخلي في الخادم، يرجى المحاولة مرة أخرى.' : 'حدث خطأ أثناء معالجة الطلب.',
        messageEn: statusCode >= 500 ? 'An internal server error occurred.' : 'An error occurred while processing the request.',
        details: error.message,
      },
    });
  });

  return app;
}