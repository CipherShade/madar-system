/**
 * Prisma Demo Seed Script — Educational Center ERP (SaaS)
 * ============================================================
 * Creates a fully-populated demo center (سنتر الأوائل التعليمي).
 * The platform Super Admin is NOT demo data: it is created only when
 * SUPER_ADMIN_USERNAME / SUPER_ADMIN_PASSWORD env vars are present
 * (see ensureSuperAdmin in src/server/lib/demoSeed.ts).
 *
 * DEMO CREDENTIALS
 * ─────────────────────────────────────────────
 *   Admin       username: admin        password: Admin@12345!
 *   Reception   username: reception1   password: Desk@12345!
 *
 * Run with:  npm run db:seed
 * ============================================================
 */

import { PrismaClient } from '@prisma/client';
import { ensureSuperAdmin, seedDemoData } from '../src/server/lib/demoSeed.js';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  console.log('🌱 Starting demo seed…\n');
  await seedDemoData(prisma);
  await ensureSuperAdmin(prisma);
  console.log('🎉 Demo seed completed successfully!\n');
  console.log('  Admin       : admin      / Admin@12345!');
  console.log('  Receptionist: reception1 / Desk@12345!');
  console.log('  Super Admin : from SUPER_ADMIN_USERNAME / SUPER_ADMIN_PASSWORD env vars');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
