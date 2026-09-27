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

test('the S3 endpoint is normalized, and plain http is refused', () => {
  const endpoint = core.normalizeS3Endpoint('https://iad1.railwayappstorage.com/');
  assert.equal(endpoint.origin, 'https://iad1.railwayappstorage.com');
  assert.equal(endpoint.host, 'iad1.railwayappstorage.com');
  assert.equal(endpoint.basePath, '', 'a trailing slash must not become a path prefix');
  assert.equal(core.normalizeS3Endpoint('https://s3.example.com/bucket/').basePath, '/bucket');

  assert.throws(() => core.normalizeS3Endpoint(''), /empty/i);
  assert.throws(() => core.normalizeS3Endpoint('not a url'), /valid URL/i);
  assert.throws(
    () => core.normalizeS3Endpoint('http://s3.example.com'),
    /https/,
    'storage credentials must never be sent unencrypted',
  );
});

test('path-style is detected from the endpoint, and can be forced', () => {
  assert.equal(
    core.resolvePathStyle({ endpointHost: 'erp-backups.iad1.railwayappstorage.com', bucket: 'erp-backups' }),
    true,
    'an endpoint already scoped to the bucket must not get the bucket name prefixed twice',
  );
  assert.equal(
    core.resolvePathStyle({ endpointHost: 'iad1.railwayappstorage.com', bucket: 'erp-backups' }),
    false,
    'a bare regional endpoint needs the bucket in the hostname',
  );
  assert.equal(core.resolvePathStyle({ endpointHost: 'iad1.example.com', bucket: 'erp-backups', override: true }), true);
  assert.equal(core.resolvePathStyle({ endpointHost: 'erp-backups.iad1.example.com', bucket: 'erp-backups', override: false }), false);
});

test('object URLs are built for both addressing styles', () => {
  const endpoint = core.normalizeS3Endpoint('https://iad1.railwayappstorage.com');

  const virtual = core.buildS3Url({ endpoint, bucket: 'erp-backups', key: 'erp-20260927-140000.dump', pathStyle: false });
  assert.equal(virtual.url, 'https://erp-backups.iad1.railwayappstorage.com/erp-20260927-140000.dump');
  assert.equal(virtual.host, 'erp-backups.iad1.railwayappstorage.com', 'the signed host must be the host actually dialled');

  const pathStyle = core.buildS3Url({ endpoint, bucket: 'erp-backups', key: 'erp-20260927-140000.dump', pathStyle: true });
  assert.equal(pathStyle.url, 'https://iad1.railwayappstorage.com/erp-20260927-140000.dump');

  const root = core.buildS3Url({ endpoint, bucket: 'erp-backups', key: '', pathStyle: true });
  assert.equal(root.url, 'https://iad1.railwayappstorage.com/', 'listing must hit the bucket root');

  const scoped = core.normalizeS3Endpoint('https://s3.example.com/erp-backups');
  assert.equal(
    core.buildS3Url({ endpoint: scoped, bucket: 'erp-backups', key: 'a.dump', pathStyle: true }).url,
    'https://s3.example.com/erp-backups/a.dump',
  );
});

test('object keys are RFC 3986 encoded, not left to the URL class', () => {
  assert.equal(core.encodeRfc3986('a b'), 'a%20b');
  assert.equal(core.encodeRfc3986("a!b'c(d)e*f"), 'a%21b%27c%28d%29e%2Af', 'encodeURIComponent leaves these five unescaped');
  const endpoint = core.normalizeS3Endpoint('https://s3.example.com');
  assert.equal(
    core.buildS3Url({ endpoint, bucket: 'erp-backups', key: 'a b&c=d.dump', pathStyle: true }).url,
    'https://s3.example.com/a%20b%26c%3Dd.dump',
  );
});

test('the canonical query string is sorted and encoded, because S3 signs the order', () => {
  assert.equal(
    core.buildCanonicalQueryString([
      ['prefix', 'erp-'],
      ['list-type', '2'],
      ['max-keys', '1000'],
    ]),
    'list-type=2&max-keys=1000&prefix=erp-',
  );
  assert.equal(core.buildListObjectsQuery({ prefix: '', maxKeys: 1000 }), 'list-type=2&max-keys=1000');
  assert.equal(
    core.buildListObjectsQuery({ prefix: 'erp-', maxKeys: 5, continuationToken: 'abc/def+ghi==' }),
    'continuation-token=abc%2Fdef%2Bghi%3D%3D&list-type=2&max-keys=5&prefix=erp-',
    'a continuation token carries characters that must be encoded, or the signature will not match',
  );
  assert.equal(core.buildListObjectsQuery({ prefix: '' }), 'list-type=2&max-keys=1000', 'an empty prefix is dropped, not sent blank');
});

test('the SigV4 signature is deterministic and changes when anything signed changes', () => {
  const request = {
    method: 'PUT',
    url: 'https://erp-backups.s3.example.com/erp-20260927-140000.dump',
    payloadHash: core.sha256Hex('payload'),
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    region: 'us-east-1',
    now: new Date('2026-09-27T03:00:00.000Z'),
  };
  assert.deepEqual(core.signS3Request(request), core.signS3Request(request), 'the same request must sign identically');

  const signatureOf = (overrides: Record<string, unknown>) =>
    /Signature=([0-9a-f]{64})/.exec(core.signS3Request({ ...request, ...overrides }).Authorization)?.[1];
  const base = signatureOf({});

  for (const [label, overrides] of [
    ['region', { region: 'iad' }],
    ['payload', { payloadHash: core.sha256Hex('different') }],
    ['method', { method: 'DELETE' }],
    ['time', { now: new Date('2026-09-27T03:00:01.000Z') }],
    ['key', { url: 'https://erp-backups.s3.example.com/other.dump' }],
    ['secret', { secretAccessKey: 'a-different-secret' }],
  ] as const) {
    assert.notEqual(signatureOf(overrides), base, `changing the ${label} must change the signature`);
  }
});

test('the signed headers and credential scope are exactly what S3 requires', () => {
  const signed = core.signS3Request({
    method: 'PUT',
    url: 'https://erp-backups.s3.example.com/erp-20260927-140000.dump',
    headers: { 'content-type': 'application/octet-stream' },
    payloadHash: core.sha256Hex('payload'),
    accessKeyId: 'AKIDEXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    region: 'iad',
    now: new Date('2026-09-27T03:00:00.000Z'),
  });

  assert.equal(signed.host, 'erp-backups.s3.example.com');
  assert.equal(signed['x-amz-date'], '20260927T030000Z');
  assert.equal(signed['x-amz-content-sha256'], core.sha256Hex('payload'));
  assert.equal(signed['content-type'], 'application/octet-stream');
  assert.match(
    signed.Authorization,
    /^AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE\/20260927\/iad\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/,
    'every x-amz-* header sent must be inside SignedHeaders, or S3 rejects the request',
  );
});

test('missing storage credentials stop the run with a name the operator can act on', () => {
  const base = { method: 'PUT', url: 'https://s3.example.com/a.dump', payloadHash: core.sha256Hex('') };
  assert.throws(() => core.signS3Request({ ...base, secretAccessKey: 's', region: 'iad' }), /BACKUP_S3_ACCESS_KEY_ID/);
  assert.throws(() => core.signS3Request({ ...base, accessKeyId: 'a', region: 'iad' }), /BACKUP_S3_SECRET_ACCESS_KEY/);
  assert.throws(() => core.signS3Request({ ...base, accessKeyId: 'a', secretAccessKey: 's' }), /BACKUP_S3_REGION/);
  assert.throws(() => core.signS3Request({ ...base, accessKeyId: ' ', secretAccessKey: 's', region: 'iad' }), /ACCESS_KEY_ID/);
});

test('the list response is parsed into names, including entity escapes', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult>
  <Name>erp-backups</Name>
  <IsTruncated>false</IsTruncated>
  <Contents><Key>erp-20260926-030000.dump</Key></Contents>
  <Contents><Key>erp-20260927-030000.dump</Key></Contents>
  <Contents><Key>erp-20260927-030000.dump.extensions.sql</Key></Contents>
</ListBucketResult>`;
  const result = core.parseListObjectsResult(xml);
  assert.deepEqual(result.names, [
    'erp-20260926-030000.dump',
    'erp-20260927-030000.dump',
    'erp-20260927-030000.dump.extensions.sql',
  ]);
  assert.equal(result.isTruncated, false);
  assert.equal(result.nextContinuationToken, null);

  const paged = core.parseListObjectsResult(
    '<ListBucketResult><IsTruncated>true</IsTruncated><NextContinuationToken>1uGawbD4x</NextContinuationToken><Contents><Key>a.dump</Key></Contents></ListBucketResult>',
  );
  assert.equal(paged.isTruncated, true);
  assert.equal(paged.nextContinuationToken, '1uGawbD4x', 'a truncated listing must be followed or old dumps are never seen, and so never pruned or aged');

  assert.equal(core.decodeXmlEntities('a&amp;b&lt;c&gt;d&quot;e&apos;f'), `a&b<c>d"e'f`);
  assert.deepEqual(core.parseListObjectsResult('<ListBucketResult></ListBucketResult>').names, []);
});

test('an S3 error names the likely cause, because the usual one is a wrong region', () => {
  const mismatch = core.describeS3Failure('Uploading erp-20260927-030000.dump', 403,
    '<Error><Code>SignatureDoesNotMatch</Code><Message>The request signature we calculated does not match.</Message></Error>', []);
  assert.match(mismatch, /SignatureDoesNotMatch/);
  assert.match(mismatch, /BACKUP_S3_REGION/, 'a wrong region is the most likely cause and the hardest to guess');

  const denied = core.describeS3Failure('Listing objects', 403, '<Error><Code>AccessDenied</Code></Error>', []);
  assert.match(denied, /AccessDenied/);
  assert.match(denied, /write access/);
});

test('secrets are scrubbed from any text that gets logged', () => {
  const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.super-secret-access-key';
  const scrubbed = core.redactSecrets(`failed with key ${key} and pass s3cr3t-password`, [key, 's3cr3t-password']);
  assert.ok(!scrubbed.includes(key));
  assert.ok(!scrubbed.includes('s3cr3t-password'));
  assert.ok(scrubbed.includes('***'));

  const failure = core.describeS3Failure('Uploading erp-20260927-030000.dump', 500, `boom ${key}`, [key]);
  assert.match(failure, /HTTP 500/);
  assert.ok(!failure.includes(key), 'the secret access key must never reach the cron log');
});

test('a long storage error body is truncated before it is logged', () => {
  const failure = core.describeS3Failure('Uploading', 400, 'x'.repeat(5000));
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

test('an upload is confirmed by reading the object back, not assumed from a 200', () => {
  const runner = read('scripts/backup/runBackup.mjs');
  assert.match(runner, /method: 'HEAD'/, 'a PUT that returns 200 is not proof the bytes arrived');
  assert.match(runner, /confirmed\.contentLength !== byteLength/, 'a truncated dump that stored cleanly is the failure this catches');
  assert.match(runner, /await headObject\(storage, name\)/);
  assert.match(runner, /confirmed present/);
});

test('the runner reads the database from the app, so it cannot drift onto another one', () => {
  const runner = read('scripts/backup/runBackup.mjs');
  assert.match(runner, /envValue\('DATABASE_URL'\)/);
  const dockerfile = read('Dockerfile.backup');
  assert.ok(
    !/postgres\.railway\.internal|pooler\.supabase\.com/.test(`${runner}${dockerfile}`),
    'the job must follow the app\'s DATABASE_URL rather than naming a host that could change',
  );
});

test('the runner no longer depends on Supabase, so a Supabase outage cannot stop the backup', () => {
  const runner = read('scripts/backup/runBackup.mjs');
  assert.ok(!/SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|storage\/v\/1/.test(runner), 'the storage backend is S3 now');
  for (const name of [
    'BACKUP_S3_ENDPOINT',
    'BACKUP_S3_REGION',
    'BACKUP_S3_ACCESS_KEY_ID',
    'BACKUP_S3_SECRET_ACCESS_KEY',
  ]) {
    assert.ok(runner.includes(name), `${name} must be read from the environment`);
  }
});

test('the backup image pins a client new enough for the server', () => {
  const dockerfile = read('Dockerfile.backup');
  assert.match(
    dockerfile,
    /postgresql-client-18/,
    'production is Railway Postgres 18; an older pg_dump refuses to connect at all',
  );
  assert.ok(
    !/postgresql-client-(?!18\b)\d+/.test(dockerfile.replace(/postgresql-client-18/g, '')),
    'only the 18 client should be installed, or apt would drag in an older pg_dump that shadows it',
  );
  assert.match(dockerfile, /CMD \["node", "scripts\/backup\/runBackup\.mjs"\]/);
  assert.ok(!/npm (ci|install)/.test(dockerfile), 'the backup job needs no dependencies, and installing any would let an app change break it');
});

test('the pinned client matches the production database version', () => {
  // The runner refuses to dump when the client is older than the server, so the
  // image pin and the deployed Postgres version have to be kept in step. Railway
  // runs the server image ghcr.io/railwayapp-templates/postgres-ssl:18.
  const dockerfile = read('Dockerfile.backup');
  const pinned = /postgresql-client-(\d+)/.exec(dockerfile)?.[1];
  assert.equal(pinned, '18', 'bump this test when the Postgres service image is upgraded');
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
