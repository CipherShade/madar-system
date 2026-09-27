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

import { execSync } from 'node:child_process';
import { ensureSuperAdmin, seedDemoData } from './lib/demoSeed.js';

attachSocketServer(app, io);

async function ensureDatabaseReady(): Promise<void> {
  try {
    await prisma.tenant.findFirst();
  } catch (err) {
    app.log.warn({ err }, 'Database tables missing or pending; running prisma db push...');
    try {
      execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
      app.log.info('Prisma db push applied successfully.');
    } catch (pushErr) {
      app.log.error({ err: pushErr }, 'Failed to run prisma db push');
    }
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