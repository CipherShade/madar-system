import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// @ts-expect-error - plain ESM, intentionally untyped so the backup runner needs no build step
import * as core from '../scripts/backup/backupCore.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/**
 * This is the unattended backup. There is nobody watching it, so the only thing
 * standing between a broken dump and six months of false confidence is these
 * tests. Every rule below is one that silently destroys data if it regresses:
 * what gets deleted, what gets considered fresh, and what never gets uploaded.
 */

test('a dump and its extension sidecar are told apart', () => {
  const dump = core.buildDumpName('20260927-140000');
  const sidecar = core.buildExtensionSidecarName(dump);

  assert.equal(dump, 'erp-20260927-140000.dump');
  assert.equal(sidecar, 'erp-20260927-140000.dump.extensions.sql');
  assert.ok(core.isDumpName(dump));
  assert.ok(!core.isDumpName(sidecar), 'a sidecar must never be counted as a dump');
  assert.ok(core.isExtensionSidecarName(sidecar));
  assert.ok(!core.isExtensionSidecarName(dump));
  assert.equal(core.dumpNameOfSidecar(sidecar), dump);
  assert.equal(core.dumpNameOfSidecar(dump), null);
});

test('dump stamps sort chronologically as plain names', () => {
  const names = [
    'erp-20260927-140000.dump',
    'erp-20260101-000000.dump',
    'erp-20261231-235959.dump',
  ];
  assert.deepEqual(names.slice().sort().reverse(), [
    'erp-20261231-235959.dump',
    'erp-20260927-140000.dump',
    'erp-20260101-000000.dump',
  ]);

  assert.equal(core.parseDumpStamp('erp-20260927-140000.dump'), Date.UTC(2026, 8, 27, 14, 0, 0));
  assert.equal(core.parseDumpStamp('erp-20260101-000000.dump'), Date.UTC(2026, 0, 1, 0, 0, 0));
});

test('impossible stamps are rejected instead of becoming a bogus date', () => {
  assert.equal(core.parseDumpStamp('erp-20261327-140000.dump'), null, 'month 13 does not exist');
  assert.equal(core.parseDumpStamp('erp-20260230-140000.dump'), null, 'February 30th does not exist');
  assert.equal(core.parseDumpStamp('erp-20260927-250000.dump'), null, 'hour 25 does not exist');
  assert.equal(core.parseDumpStamp('erp-20260927-140000.dump.extensions.sql'), null);
  assert.equal(core.parseDumpStamp('not-a-dump.dump'), null);
});

test('the connection string is split without ever printing the password', () => {
  const parsed = core.parseDatabaseUrl('postgresql://postgres.proj:s3cr%40t%2Fvalue@aws-1-eu-west-1.pooler.supabase.com:5432/postgres');
  assert.equal(parsed.host, 'aws-1-eu-west-1.pooler.supabase.com');
  assert.equal(parsed.port, 5432);
  assert.equal(parsed.user, 'postgres.proj');
  assert.equal(parsed.database, 'postgres');
  assert.equal(parsed.password, 's3cr@t/value', 'a percent-encoded password must be decoded to connect');
  assert.equal(parsed.masked, 'postgresql://postgres.proj:***@aws-1-eu-west-1.pooler.supabase.com:5432/postgres');
  assert.ok(!parsed.masked.includes('s3cr'));
});

test('a connection string missing a password is refused', () => {
  assert.throws(() => core.parseDatabaseUrl(''), /empty/i);
  assert.throws(() => core.parseDatabaseUrl('postgresql://user@host:5432/db'), /no password/i);
  assert.throws(() => core.parseDatabaseUrl('postgresql://user:pass@host:5432/'), /no database/i);
});

test('the default port is 5432 and Supabase\'s transaction pooler is rejected', () => {
  assert.equal(core.parseDatabaseUrl('postgresql://u:p@host/db').port, 5432);
  assert.equal(core.describeUndumpablePort(5432), null);
  assert.match(
    core.describeUndumpablePort(6543) ?? '',
    /transaction pooler/,
    'port 6543 is the transaction pooler, which pg_dump cannot use',
  );
});

test('the dump is portable: public schema only, custom format, no ownership', () => {
  const args = core.buildPgDumpArgs({
    host: 'h',
    port: 5432,
    user: 'u',
    database: 'db',
    file: '/tmp/erp.dump',
  });
  assert.ok(args.includes('--schema=public'), 'only public is portable off Supabase');
  assert.ok(args.includes('--format=custom'));
  assert.ok(args.includes('--no-owner'));
  assert.ok(args.includes('--no-privileges'));
  assert.ok(args.includes('--file=/tmp/erp.dump'));
  assert.ok(!args.includes('--data-only'), 'a schema-only dump would restore to an empty database');
  assert.ok(!args.some((a) => a.includes('p@')), 'the password must never appear in the argument list');

  const allSchemas = core.buildPgDumpArgs({
    host: 'h',
    port: 5432,
    user: 'u',
    database: 'db',
    file: '/tmp/erp.dump',
    allSchemas: true,
  });
  assert.ok(!allSchemas.includes('--schema=public'));
});

test('Supabase-internal extensions are not recorded, and the portable ones are', () => {
  const selected = core.selectPortableExtensions([
    'pg_trgm',
    'supabase_vault',
    'supabase_pg_etleap',
    'plpgsql',
    'pgsodium',
    'pg_graphql',
    'pg_stat_statements',
    ' pgcrypto ',
    'unaccent',
    'uuid-ossp',
    '',
  ]);
  assert.deepEqual(selected, ['pg_trgm', 'pgcrypto', 'unaccent', 'uuid-ossp']);
});

test('the extension sidecar is a restorable script', () => {
  const sql = core.renderExtensionsSql(['pg_trgm', 'pgcrypto', 'unaccent', 'uuid-ossp']);
  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS "pg_trgm" SCHEMA public;/);
  assert.match(sql, /CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;/);
  assert.ok(!sql.includes('supabase_vault'));
  assert.equal(core.renderExtensionsSql([]).split('\n').filter((l) => l.startsWith('CREATE')).length, 0);
});

test('an unexpected extension name cannot inject SQL into the sidecar', () => {
  assert.throws(
    () => core.renderExtensionsSql(['pg_trgm"; DROP TABLE "Student"']),
    /unexpected name/i,
    'a name that is not a plain identifier must stop the run, not be written out',
  );
  assert.ok(core.isSafeSqlIdentifier('pg_trgm'));
  assert.ok(core.isSafeSqlIdentifier('uuid-ossp'));
  assert.ok(!core.isSafeSqlIdentifier('Uuid-OSSP'));
  assert.ok(!core.isSafeSqlIdentifier('pg trgm'));
});

test('retention keeps the newest dumps and takes their sidecars with them', () => {
  const objects = [
    'erp-20260925-140000.dump',
    'erp-20260925-140000.dump.extensions.sql',
    'erp-20260926-140000.dump',
    'erp-20260926-140000.dump.extensions.sql',
    'erp-20260927-140000.dump',
    'erp-20260927-140000.dump.extensions.sql',
  ];
  const plan = core.planRetention(objects, 2);
  assert.deepEqual(plan.retained, ['erp-20260927-140000.dump', 'erp-20260926-140000.dump']);
  assert.ok(plan.toDelete.includes('erp-20260925-140000.dump'));
  assert.ok(plan.toDelete.includes('erp-20260925-140000.dump.extensions.sql'));
  assert.ok(!plan.toDelete.includes('erp-20260927-140000.dump'), 'the newest dump must never be deleted');
  assert.ok(!plan.toDelete.includes('erp-20260927-140000.dump.extensions.sql'));
  assert.ok(!plan.toDelete.includes('erp-20260926-140000.dump.extensions.sql'));
});

test('an orphaned sidecar is cleaned up, unrelated objects are left alone', () => {
  const objects = [
    'erp-20260927-140000.dump',
    'erp-20260927-140000.dump.extensions.sql',
    'erp-20260101-140000.dump.extensions.sql',
    'README.txt',
  ];
  const plan = core.planRetention(objects, 5);
  assert.deepEqual(plan.toDelete, ['erp-20260101-140000.dump.extensions.sql']);
});

test('a retention count below one is refused rather than emptying the bucket', () => {
  const objects = ['erp-20260927-140000.dump', 'erp-20260926-140000.dump'];
  assert.throws(() => core.planRetention(objects, 0), /at least 1/i);
  assert.throws(() => core.planRetention(objects, -1), /at least 1/i);
  assert.throws(() => core.planRetention(objects, 1.5), /at least 1/i);
  assert.throws(() => core.planRetention(objects, Number.NaN), /at least 1/i);
});

test('nothing is deleted while there are fewer dumps than the keep count', () => {
  const objects = ['erp-20260927-140000.dump', 'erp-20260927-140000.dump.extensions.sql'];
  assert.deepEqual(core.planRetention(objects, 14), {
    retained: ['erp-20260927-140000.dump'],
    toDelete: [],
  });
});

test('staleness is measured from the newest stored dump', () => {
  const names = ['erp-20260925-140000.dump', 'erp-20260927-140000.dump', 'garbage.dump'];
  const now = Date.parse('2026-09-27T16:00:00Z');

  const fresh = core.evaluateFreshness({ dumpNames: names, now, maxAgeHours: 48 });
  assert.equal(fresh.ok, true);
  assert.equal(fresh.newest, Date.parse('2026-09-27T14:00:00Z'));

  const stale = core.evaluateFreshness({ dumpNames: names, now: Date.parse('2026-10-05T00:00:00Z'), maxAgeHours: 48 });
  assert.equal(stale.ok, false, 'backups that stopped a week ago must fail the run');
  assert.match(stale.message, /stale/i);

  const empty = core.evaluateFreshness({ dumpNames: [], now, maxAgeHours: 48 });
  assert.equal(empty.ok, false);
  assert.equal(empty.newest, null);
});

test('a nonsense freshness limit is refused', () => {
  assert.throws(() => core.evaluateFreshness({ dumpNames: [], now: 0, maxAgeHours: 0 }), /positive/i);
  assert.throws(() => core.evaluateFreshness({ dumpNames: [], now: 0, maxAgeHours: -5 }), /positive/i);
  assert.throws(() => core.evaluateFreshness({ dumpNames: [], now: 0, maxAgeHours: 'soon' }), /positive/i);
});

test('a dump under 1 KB is treated as a failure, not a small success', () => {
  assert.equal(core.isSuspiciouslySmallDump(512), true);
  assert.equal(core.isSuspiciouslySmallDump(0), true);
  assert.equal(core.isSuspiciouslySmallDump(1023), true);
  assert.equal(core.isSuspiciouslySmallDump(1024), false);
  assert.equal(core.isSuspiciouslySmallDump(90_000), false);
});

test('storage URLs are built and encoded safely', () => {
  const supabaseUrl = 'https://abcdefgh.supabase.co';
  assert.equal(
    core.buildObjectUrl({ supabaseUrl, bucket: 'erp-backups', path: 'erp-20260927-140000.dump' }),
    'https://abcdefgh.supabase.co/storage/v1/object/erp-backups/erp-20260927-140000.dump',
  );
  assert.equal(
    core.buildObjectUrl({ supabaseUrl, bucket: 'my bucket', path: 'a b.dump' }),
    'https://abcdefgh.supabase.co/storage/v1/object/my%20bucket/a%20b.dump',
  );
  assert.equal(core.buildBucketUrl({ supabaseUrl }), 'https://abcdefgh.supabase.co/storage/v1/bucket');
  assert.equal(
    core.buildListUrl({ supabaseUrl, bucket: 'erp-backups', limit: 5, offset: 10 }),
    'https://abcdefgh.supabase.co/storage/v1/object/list/erp-backups?prefix=&limit=5&offset=10',
  );
  assert.equal(core.normalizeSupabaseUrl('https://abcdefgh.supabase.co/'), 'https://abcdefgh.supabase.co');
  assert.throws(() => core.normalizeSupabaseUrl('ftp://x'), /http or https/i);
  assert.throws(() => core.normalizeSupabaseUrl(''), /empty/i);
});

test('the bucket is created private, with a size ceiling', () => {
  const payload = core.buildBucketPayload({ bucket: 'erp-backups', fileSizeLimitBytes: 1024 });
  assert.equal(payload.public, false, 'student and payment data must never be world-readable');
  assert.equal(payload.id, 'erp-backups');
  assert.equal(payload.file_size_limit, 1024);
});

test('the service role key is sent as auth headers and is never accepted empty', () => {
  const headers = core.buildAuthHeaders('sk-supabase-secret-value');
  assert.equal(headers.apikey, 'sk-supabase-secret-value');
  assert.equal(headers.Authorization, 'Bearer sk-supabase-secret-value');
  assert.throws(() => core.buildAuthHeaders(''), /service_role/i);
  assert.throws(() => core.buildAuthHeaders('   '), /service_role/i);
});

test('secrets are scrubbed from any text that gets logged', () => {
  const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.super-secret-service-role';
  const scrubbed = core.redactSecrets(`failed with key ${key} and pass s3cr3t-password`, [key, 's3cr3t-password']);
  assert.ok(!scrubbed.includes(key));
  assert.ok(!scrubbed.includes('s3cr3t-password'));
  assert.ok(scrubbed.includes('***'));

  const failure = core.describeStorageFailure('Uploading erp-20260927-140000.dump', 500, `boom ${key}`, [key]);
  assert.match(failure, /HTTP 500/);
  assert.ok(!failure.includes(key));
});

test('a long storage error body is truncated before it is logged', () => {
  const failure = core.describeStorageFailure('Uploading', 400, 'x'.repeat(5000));
  assert.ok(failure.length < 500, 'an unbounded error body would flood the cron log');
});

test('the runner reports a single machine-readable result line either way', () => {
  const runner = read('scripts/backup/runBackup.mjs');
  assert.match(runner, /BACKUP_RESULT status=ok/);
  assert.match(runner, /BACKUP_RESULT status=failed/);
  assert.match(runner, /process\.exitCode = 1/, 'a failed backup must fail the run so Railway reports it');
});

test('the runner deletes its temporary copy of the dump', () => {
  const runner = read('scripts/backup/runBackup.mjs');
  assert.match(runner, /rmSync\(workDir, \{ recursive: true, force: true \}\)/, 'student data must not be left on disk');
  assert.match(runner, /finally \{/);
});

test('the runner never passes the database password on a command line', () => {
  const runner = read('scripts/backup/runBackup.mjs');
  assert.match(runner, /PGPASSWORD/, 'the password belongs in the child environment');
  assert.doesNotMatch(runner, /args[^\n]*database\.password/);
});

test('the automated and local backups agree on which extensions are portable', () => {
  const local = read('scripts/backup-db.ps1');
  const localMatch = /\$EXTENSION_DENYLIST\s*=\s*'([^']+)'/.exec(local);
  assert.ok(localMatch, 'could not find the denylist in the PowerShell script');
  const localPattern = new RegExp(localMatch[1]);

  for (const name of ['pg_trgm', 'pgcrypto', 'unaccent', 'uuid-ossp']) {
    assert.equal(core.isPortableExtension(name), !localPattern.test(name), `${name} disagrees between the two scripts`);
  }
  for (const name of ['supabase_vault', 'supabase_pg_etleap', 'plpgsql', 'pgsodium', 'pg_graphql', 'pg_stat_statements']) {
    assert.equal(core.isPortableExtension(name), !localPattern.test(name), `${name} disagrees between the two scripts`);
  }
});

test('the backup image pins a client new enough for the server', () => {
  const dockerfile = read('Dockerfile.backup');
  assert.match(
    dockerfile,
    /postgresql-client-17/,
    'Supabase runs PostgreSQL 17; an older pg_dump refuses to connect at all',
  );
  assert.ok(
    !/postgresql-client-(?!17\b)\d+/.test(dockerfile.replace(/postgresql-client-17/g, '')),
    'only the 17 client should be installed, or apt would drag in an older pg_dump that shadows it',
  );
  assert.match(dockerfile, /CMD \["node", "scripts\/backup\/runBackup\.mjs"\]/);
  assert.ok(!/npm (ci|install)/.test(dockerfile), 'the backup job needs no dependencies, and installing any would let an app change break it');
});

test('the remote backup is wired into package.json', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['db:backup:remote'], 'node scripts/backup/runBackup.mjs');
  assert.equal(pkg.scripts['db:backups:remote:list'], 'node scripts/backup/runBackup.mjs --list');
});

test('the backup scripts are plain ESM with no build step or dependencies', () => {
  for (const file of ['scripts/backup/backupCore.mjs', 'scripts/backup/runBackup.mjs']) {
    const source = read(file);
    assert.ok(!/\brequire\(/.test(source), `${file} must not use require in an ESM file`);
    assert.ok(!/from '(?!\.|node:)/.test(source), `${file} must not import from node_modules`);
  }
});
