import { Server } from 'socket.io';
import { buildApp } from './app.js';
import { config } from './config/index.js';
import { prisma } from './lib/prisma.js';
import { attachSocketServer } from './lib/socket.js';

const app = buildApp();
const io = new Server(app.server, {
  cors: {
    origin: config.corsOrigins,
    credentials: true,
  },
  maxHttpBufferSize: config.socketMaxPayloadBytes,
});

import { ensureSuperAdmin, seedDemoData } from './lib/demoSeed.js';

attachSocketServer(app, io);

const MIGRATION_REMEDY =
  'Apply the pending migrations with `prisma migrate deploy` (npm run db:migrate:deploy), then restart.';

/**
 * A model query failing means the schema is not what the code expects. It does
 * not mean this process may fix that.
 *
 * `prisma migrate deploy` already ran in the start command (the container CMD
 * and `npm run start:production`) before this file's process existed, so
 * production is migrated by the time these lines run. What used to happen
 * instead: a fallback ran `prisma db push --accept-data-loss` here, on every
 * environment including production. That reconciles the database by running DDL
 * straight from schema.prisma, and --accept-data-loss is what permits it to drop
 * columns and tables so the shapes match. So any later edit to schema.prisma that
 * removed a field would delete that column's real student and payment data on the
 * next restart — no migration, no SQL, no warning, and the failure was swallowed,
 * so the server started as if nothing had happened. Nothing in the code around it
 * looked dangerous; the command simply ran first and got there quietly.
 *
 * So: no schema change happens at startup, in any environment. An unapplied
 * migration has to stop the boot instead of being applied behind the deploy's
 * back.
 */
async function reportSchemaNotReady(err: unknown): Promise<void> {
  // Distinguish "schema is wrong" from "database is gone". A database that
  // answers `SELECT 1` but not a model query is reachable and unmigrated — a
  // deployment failure that fails the boot below. One that cannot be reached at
  // all is not a schema problem, and /api/health already reports it as 503, so it
  // stays non-fatal rather than turning a network blip into a restart loop.
  const reachable = await prisma.$queryRaw`SELECT 1`.then(
    () => true,
    () => false,
  );

  if (!reachable) {
    app.log.error(
      { err },
      'Cannot reach the database. Starting anyway; /api/health reports this as unavailable until it recovers.',
    );
    return;
  }

  app.log.error({ err }, `The database is reachable but the schema is missing or out of date. ${MIGRATION_REMEDY}`);

  if (config.nodeEnv === 'production') {
    throw new Error(
      `Refusing to start in production: the database schema is missing or behind schema.prisma. ${MIGRATION_REMEDY} ` +
        'This server never applies migrations itself, so it cannot be started until they have been applied.',
    );
  }

  // Development keeps the shortcut a developer can take by hand, never one that
  // fires on its own: `npm run db:push` applies schema.prisma to a local
  // database, and `npm run db:migrate` records the change as a migration.
  app.log.warn(
    `Continuing in ${config.nodeEnv} without a usable schema; requests will fail until you run it. ` +
      'Use `npm run db:push` for a throwaway local database, or `npm run db:migrate` to record the change.',
  );
}

async function ensureDatabaseReady(): Promise<void> {
  try {
    await prisma.tenant.findFirst();
  } catch (err) {
    await reportSchemaNotReady(err);
  }

  try {
    // Demo tenants must never be created in production: the seeder's passwords
    // are public defaults, and seeding writes rows into a live database on every
    // restart. `ensureSuperAdmin` is different — it creates the platform owner
    // from env vars and is required in production, so it always runs.
    if (config.nodeEnv !== 'production') {
      app.log.info('Ensuring demo seed data is ready...');
      await seedDemoData(prisma);
    } else {
      app.log.info('Production: skipping demo seed data.');
    }
    await ensureSuperAdmin(prisma);
    app.log.info('Database seed verification completed successfully.');
  } catch (seedErr) {
    app.log.error({ err: seedErr }, 'Failed during database seed');
  }
}

async function start(): Promise<void> {
  try {
    await ensureDatabaseReady();
    await app.listen({ port: config.port, host: '0.0.0.0' });

    app.log.info(
      { environment: config.nodeEnv },
      'Educational Center ERP server started (Fastify + Socket.io)',
    );
    app.log.info(
      { port: config.port, apiUrl: `http://localhost:${config.port}/api` },
      'HTTP API listening',
    );
    app.log.info({ healthUrl: '/api/health' }, 'Health-check endpoint');
    app.log.info({ locale: config.defaultLocale }, 'Default language (Arabic-first RTL)');
    app.log.info({ allowedOrigins: config.corsOrigins }, 'CORS/CSRF allowed origins (not secrets)');
    if (
      config.nodeEnv === 'production' &&
      config.corsOrigins.length === 1 &&
      config.corsOrigins[0] === 'http://localhost:5173'
    ) {
      app.log.warn(
        'CORS_ORIGIN is still the Vite development origin; set it to the real browser origin in production.',
      );
    }
  } catch (err) {
    app.log.error({ err }, 'Server startup failed');
    // Best-effort cleanup, then a non-zero exit so the process manager restarts/marks unhealthy.
    await shutdownResources('startup-failure');
    process.exit(1);
  }
}

let shuttingDown = false;

async function shutdownResources(reason: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ reason }, 'Initiating graceful shutdown (Socket.io + HTTP + Prisma)');

  const forceExitTimer = setTimeout(() => {
    app.log.warn('Graceful shutdown timed out after 10s; forcing exit.');
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  try {
    await io.close();
    await app.close();
    await prisma.$disconnect();
    clearTimeout(forceExitTimer);
    app.log.info({ reason }, 'Graceful shutdown completed');
  } catch (err) {
    app.log.error({ err, reason }, 'Error during graceful shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  void shutdownResources('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdownResources('SIGINT');
});
process.on('unhandledRejection', (reason) => {
  app.log.error({ err: reason }, 'Unhandled promise rejection');
});

void start();