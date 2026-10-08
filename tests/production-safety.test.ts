import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
/**
 * Comments have to name the command they are warning against, so the guards
 * below read executable code only. Block comments and whole-line `//` are both
 * dropped; a `//` that trails real code is rare enough here not to be worth
 * tracking, and a false pass on a line like that is still caught by the
 * behavioural tests that assert on the running app.
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

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

test('the standalone demo seed refuses to run in production', () => {
  const seed = code('prisma/seed.ts');
  // `prisma db seed` / `npm run db:seed` never touch server.ts, so the boot-time
  // guard does not protect them; the script has to refuse on its own.
  assert.match(seed, /NODE_ENV\s*===\s*'production'/, 'the seed must gate on production specifically');
  assert.match(seed, /process\.exit\(1\)/, 'a refused seed must exit non-zero');
  const gate = seed.indexOf("NODE_ENV === 'production'");
  const seedCall = seed.indexOf('seedDemoData(prisma)');
  assert.ok(gate > 0 && seedCall > gate, 'the gate must come before the seed runs');
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

/**
 * The container start command once ran `prisma db push --accept-data-loss`. That
 * reconciles the database by running DDL straight from schema.prisma, and
 * --accept-data-loss permits it to drop columns and tables to make the shapes
 * match. So any later edit that removed a field would delete that column's real
 * student and payment data on the next deploy, with no migration and no warning.
 * The comment directly above the command already said `migrate deploy`, which is
 * how a destructive shortcut survives review.
 */
test('deploys change the database through migrations, not db push', () => {
  const dockerfile = read('Dockerfile');
  const cmd = dockerfile.slice(dockerfile.lastIndexOf('CMD '));

  assert.match(cmd, /prisma migrate deploy/, 'the container must apply migrations on start');
  assert.doesNotMatch(cmd, /prisma db push/, 'db push must never run against production');
  assert.doesNotMatch(cmd, /--accept-data-loss/, 'a production start must never accept data loss');

  // Anywhere else in the file too, ignoring comments, which legitimately have to
  // name the command they are warning against.
  const code = dockerfile
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .join('\n');
  assert.doesNotMatch(code, /db push/, 'db push must not appear in any executable line');
});

/**
 * The container CMD was fixed, but the same fallback also lived in the server's
 * own startup path: `ensureDatabaseReady` probed a model and, when the probe
 * failed, ran `prisma db push --accept-data-loss` — on every environment,
 * including production, where nothing guards it. The CMD's `migrate deploy` had
 * already run by then, so the fallback could only ever fire on a database that
 * migrate deploy had just touched: a migration that failed to apply, a
 * DATABASE_URL that differs between the two commands, or a boot that skipped the
 * start command. It is also what fires on a schema that is merely *behind*, since
 * the probe cannot tell a missing table from a stale one.
 *
 * It was the worse of the two because the failure was swallowed. A dropped column
 * deleted real student and payment rows, the process logged the push as applied,
 * and the server started normally — so the loss was visible only as a broken
 * screen, days later, with nothing in the deploy log tying it to this line.
 */
test('the server applies no schema change at startup, in any environment', () => {
  const server = code('src/server/server.ts');

  assert.doesNotMatch(
    server,
    /db push/i,
    'server startup must never reconcile the schema; only migrations may change it',
  );
  assert.doesNotMatch(
    server,
    /--accept-data-loss/,
    'a server that accepts data loss can drop columns and real rows',
  );
  // `npm start` bypasses the migrate deploy in `start:production`, so the process
  // itself has to be the backstop: a reachable database with an unapplied
  // migration must stop the boot, not be repaired.
  assert.match(
    server,
    /config\.nodeEnv === 'production'[\s\S]{0,600}?throw new Error\(/,
    'production must fail to start when the schema is behind, not apply it',
  );
  // And the boot must actually be inside a failure path: an error thrown before
  // listen() is what turns into a non-zero exit.
  assert.match(server, /await ensureDatabaseReady\(\);\s*await app\.listen\(/);
  assert.match(server, /process\.exit\(1\)/, 'a failed startup must exit non-zero for the orchestrator');
  // The probe survives, because it is what reports a bad database; it may only read.
  assert.match(read('src/server/server.ts'), /prisma\.tenant\.findFirst\(\)/);
});

/**
 * The one remaining `db push --accept-data-loss` in the server is the demo reset
 * endpoint, which is legitimate: it exists to make a local database demo-able
 * and there is nothing in production worth resetting. It is still an
 * unauthenticated schema-rewriting endpoint, so its gate has to hold when
 * something is misconfigured — and `config.nodeEnv` defaults to 'development'
 * when NODE_ENV is unset, so `!== 'production'` published it to a deployment that
 * simply forgot to set the variable.
 */
test('the demo reset endpoint cannot be registered outside development', () => {
  const app = code('src/server/app.ts');
  const gate = app.indexOf("config.nodeEnv === 'development'");
  const route = app.indexOf("app.all('/api/setup-demo'");

  assert.ok(gate > 0, 'the demo reset endpoint must be gated on development specifically');
  assert.ok(route > gate, 'the gate must come before the route it guards');

  // Every occurrence, not just the first: the command line and the log line that
  // names it are two separate strings, and a second one added outside the gate is
  // exactly the regression worth catching.
  const pushes = [...app.matchAll(/db push/g)].map((m) => m.index);
  assert.ok(pushes.length > 0, 'the demo endpoint should still push its schema');
  for (const at of pushes) {
    assert.ok(at > gate, 'every db push must live inside the development-only block');
  }
  assert.doesNotMatch(app, /--accept-data-loss[^\n]*\n[^\n]*production/, 'no production branch may reach a data-loss push');
});

test('the container start command agrees with the documented one', () => {
  const dockerfile = read('Dockerfile');
  const cmd = dockerfile.slice(dockerfile.lastIndexOf('CMD '));
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

  // The image comment documents the command. If the two drift apart, the comment
  // is what a reviewer trusts, and it is the one that gets ignored.
  const documented = /prisma migrate deploy && node dist\/server\/server\/server\.js/;
  assert.match(cmd, documented, 'the CMD should be the command the comment above it describes');
  assert.match(pkg.scripts['start:production'], /migrate deploy/, 'start:production must also use migrations');
  assert.doesNotMatch(pkg.scripts['start:production'], /db push/);
});

/**
 * Production is one path: GitHub → Railway → Railway Postgres. Railway builds
 * the root `Dockerfile` from `main` and starts it with `npm run start:production`.
 *
 * The repository used to also carry a Render blueprint (`render.yaml`) and a
 * manual workflow that POSTed to Render's deploy API using `RENDER_SERVICE_ID`
 * and `RENDER_API_KEY`. Both were dead: nothing at Render was live, nothing read
 * `render.yaml`, and the workflow's only deploy step targeted a host that no
 * longer existed, so it could only fail or — worse — be "fixed" by pointing
 * somewhere new. Two deployment definitions is how a team ends up unsure which
 * one production actually runs, and which one to change in a hurry.
 *
 * The guard is deliberately about the shape of the tree, not about the absence
 * of a word: it fails if a second provider's deploy config reappears, and it
 * fails if the Railway build or start command the live service depends on is
 * renamed or dropped.
 */
test('there is exactly one production deployment path: GitHub → Railway → PostgreSQL', () => {
  // No Render blueprint, and no host manifest for any other Node host.
  assert.equal(existsSync(join(root, 'render.yaml')), false, 'the Render blueprint is gone and must not come back');

  // The one host definition the live service actually builds from.
  assert.ok(existsSync(join(root, 'Dockerfile')), 'the root Dockerfile builds the Railway web service');
  assert.ok(
    existsSync(join(root, 'Dockerfile.backup')),
    'Dockerfile.backup builds the Railway backup cron service',
  );

  // No workflow may call a provider's deploy API. Railway deploys from the
  // GitHub push itself, so a workflow doing it is a second, conflicting path.
  const workflowDir = join(root, '.github', 'workflows');
  const workflows = existsSync(workflowDir) ? readdirSync(workflowDir).filter((f) => /\.ya?ml$/.test(f)) : [];
  for (const file of workflows) {
    const body = read(join('.github', 'workflows', file));
    assert.doesNotMatch(
      body,
      /api\.render\.com|railway\.app\/api|deploy hook|hook\.railway\.app/i,
      `${file} triggers a provider deploy API; production deploys on push to main`,
    );
  }

  // CI is the gate on that push, and it must keep running.
  assert.ok(workflows.includes('ci.yml'), 'CI is what gates the push Railway deploys from');

  // The two commands the live service runs, spelled exactly as the service has
  // them configured. Renaming either silently breaks the deploy.
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts['build:production'], 'npm run db:generate && npm run build:client && npm run build:server');
  assert.equal(pkg.scripts['start:production'], 'prisma migrate deploy && node dist/server/server/server.js');
  assert.match(read('Dockerfile'), /RUN npm run build:production/, 'the image must build with build:production');
});

