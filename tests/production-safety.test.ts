import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/**
 * The demo seeder used to run on every boot in every environment and upsert its
 * two users on `username`, overwriting `passwordHash` and `tenantId`. Since
 * `username` is globally unique, a real client registered as "admin" had their
 * password reset to a public default and their account moved into the throwaway
 * demo tenant on every deploy.
 */

test('the demo seed never runs in production', () => {
  const server = read('src/server/server.ts');
  assert.match(server, /config\.nodeEnv !== 'production'[\s\S]{0,400}?seedDemoData\(prisma\)/);
  // ensureSuperAdmin must stay outside that guard, or nobody can approve clients.
  const guardStart = server.indexOf("config.nodeEnv !== 'production'");
  const superAdmin = server.indexOf('ensureSuperAdmin(prisma)');
  assert.ok(guardStart > 0 && superAdmin > guardStart, 'ensureSuperAdmin should still run unconditionally');
});

test('the demo seed never overwrites an existing account', () => {
  const seed = read('src/server/lib/demoSeed.ts');

  // The bug was an upsert keyed on a hardcoded literal username, writing
  // credentials back over whoever held that name. Neither demo username may be
  // used as a lookup key for mutation at all.
  assert.doesNotMatch(seed, /where:\s*\{\s*username:\s*'admin'\s*\}/, 'demo seed must not look up "admin" to mutate it');
  assert.doesNotMatch(seed, /where:\s*\{\s*username:\s*'reception1'\s*\}/, 'demo seed must not look up "reception1" to mutate it');

  // No upsert anywhere in the demo seeding may rewrite a password or reassign a
  // tenant. `ensureSuperAdmin` is excluded: it is keyed on an operator-supplied
  // env username and intentionally re-reads it on every boot, which is the one
  // place a credential rewrite belongs.
  const demoSection = seed.replace(
    /export async function ensureSuperAdmin[\s\S]*?\/\/ ── 1\. MAIN CENTER/,
    '// ── 1. MAIN CENTER',
  );
  for (const block of demoSection.match(/update:\s*\{[^}]*\}/g) ?? []) {
    assert.doesNotMatch(block, /passwordHash/, `credential rewrite found: ${block}`);
    assert.doesNotMatch(block, /tenantId/, `tenant reassignment found: ${block}`);
  }

  // And it must refuse outright when the name belongs to a real center.
  assert.match(seed, /already registered to another center/);
});

test('there is no hardcoded signing secret left in the codebase', () => {
  const config = read('src/server/config/index.ts');
  assert.doesNotMatch(config, /'edu-center-[a-z-]*secret/, 'a literal fallback secret ships in source');
  assert.doesNotMatch(config, /'edu-center-[a-z-]*safe'/);
  // The fallback must be random, so a misconfigured deploy cannot be forged.
  assert.match(config, /randomBytes\(32\)/);
});

test('a generated secret is random per load, not a shared constant', async () => {
  const configUrl = new URL('../src/server/config/index.ts', import.meta.url).href;

  // A cache-busting query re-evaluates the module, standing in for a fresh
  // process: each load with no JWT_SECRET configured must invent its own.
  const load = async (jwtSecret?: string) => {
    const previousJwt = process.env.JWT_SECRET;
    const previousNodeEnv = process.env.NODE_ENV;
    if (jwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = jwtSecret;
    delete process.env.NODE_ENV;
    try {
      const mod = await import(`${configUrl}?fresh=${Math.random()}`);
      return { secret: mod.config.jwtSecret, generated: mod.config.usingGeneratedJwtSecret };
    } finally {
      if (previousJwt === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousJwt;
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
    }
  };

  const a = await load();
  const b = await load();
  assert.equal(a.generated, true, 'should report that it invented the secret');
  assert.notEqual(a.secret, b.secret, 'two loads must not share one fallback secret');
  assert.ok(a.secret.length >= 32, 'a generated secret should be long enough to be unguessable');

  const configured = await load('a-real-configured-secret-value-32chars');
  assert.equal(configured.generated, false);
  assert.equal(configured.secret, 'a-real-configured-secret-value-32chars');
});
