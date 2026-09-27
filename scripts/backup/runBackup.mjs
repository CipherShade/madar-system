#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildAuthHeaders,
  buildBucketPayload,
  buildBucketUrl,
  buildDeletePayload,
  buildDumpName,
  buildExtensionSidecarName,
  buildListUrl,
  buildObjectUrl,
  buildPgDumpArgs,
  buildPortableExtensionsQuery,
  buildPsqlArgs,
  describeStorageFailure,
  describeUndumpablePort,
  evaluateFreshness,
  isSuspiciouslySmallDump,
  parseDatabaseUrl,
  planRetention,
  redactSecrets,
  renderExtensionsSql,
  selectPortableExtensions,
} from './backupCore.mjs';

const secrets = [];
const redact = (text) => redactSecrets(text, secrets);

function rememberSecret(value) {
  if (typeof value === 'string' && value.trim()) secrets.push(value.trim());
}

function envValue(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw.trim() === '') {
    if (fallback === undefined) {
      throw new Error(`${name} is not set.`);
    }
    return fallback;
  }
  return raw.trim();
}

function envNumber(name, fallback) {
  const raw = envValue(name, undefined);
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number, got ${JSON.stringify(raw)}`);
  }
  return value;
}

function stampFor(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z').replace('T', '-');
}

function runTool(bin, args, what, database) {
  const result = spawnSync(bin, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, PGPASSWORD: database.password },
  });
  if (result.error) {
    throw new Error(`${what} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = String(result.stderr || '').trim();
    throw new Error(redact(`${what} failed with exit code ${result.status}${stderr ? `: ${stderr}` : ''}`));
  }
  return String(result.stdout || '').trim();
}

function majorVersion(text) {
  const match = /(\d+)/.exec(String(text || ''));
  return match ? Number(match[1]) : null;
}

function assertClientSupportsServer(database) {
  const dumpVersion = runTool('pg_dump', ['--version'], 'pg_dump --version', database);
  const serverVersion = runTool(
    'psql',
    buildPsqlArgs({ ...database, sql: 'SHOW server_version;' }),
    'reading the server version',
    database,
  );
  const dumpMajor = majorVersion(dumpVersion);
  const serverMajor = majorVersion(serverVersion);
  if (dumpMajor === null || serverMajor === null) {
    throw new Error(`Could not compare versions: pg_dump says "${dumpVersion}", server says "${serverVersion}"`);
  }
  if (dumpMajor < serverMajor) {
    throw new Error(`pg_dump is version ${dumpMajor} but the server is ${serverMajor}. pg_dump must be at least as new as the server, or it refuses to run.`);
  }
  console.log(`Connected to ${database.masked}. pg_dump ${dumpVersion}, server ${serverVersion}.`);
}

async function storageRequest(url, { action, method = 'GET', headers = {}, body, secretsToRedact = [] } = {}) {
  let response;
  try {
    response = await fetch(url, { method, headers, body });
  } catch (error) {
    throw new Error(`${action} could not reach Supabase Storage: ${error.message}`);
  }
  const text = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(describeStorageFailure(action, response.status, text, secretsToRedact));
  }
  return { response, text };
}

async function ensureBucket({ supabaseUrl, bucket, authHeaders, fileSizeLimitBytes }) {
  const listUrl = buildListUrl({ supabaseUrl, bucket, limit: 1 });
  let exists = false;
  try {
    const probe = await storageRequest(listUrl, {
      action: `Probing the "${bucket}" bucket`,
      headers: authHeaders,
    });
    JSON.parse(probe.text);
    exists = true;
  } catch {
    exists = false;
  }
  if (exists) return;
  try {
    await storageRequest(buildBucketUrl({ supabaseUrl }), {
      action: `Creating the "${bucket}" bucket`,
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify(buildBucketPayload({ bucket, fileSizeLimitBytes })),
      secretsToRedact: secrets,
    });
    console.log(`Created private bucket "${bucket}".`);
  } catch (error) {
    const created = await storageRequest(buildListUrl({ supabaseUrl, bucket, limit: 1 }), {
      action: `Confirming the "${bucket}" bucket exists`,
      headers: authHeaders,
    });
    JSON.parse(created.text);
    console.log(`Bucket "${bucket}" already exists.`);
  }
}

async function listObjects({ supabaseUrl, bucket, authHeaders, pageSize = 1000 }) {
  const names = [];
  for (let offset = 0; offset < 100000; offset += pageSize) {
    const url = buildListUrl({ supabaseUrl, bucket, limit: pageSize, offset });
    const { text } = await storageRequest(url, {
      action: `Listing objects in "${bucket}"`,
      headers: authHeaders,
    });
    let page;
    try {
      page = JSON.parse(text);
    } catch {
      throw new Error(`Listing objects in "${bucket}" returned a body that is not JSON.`);
    }
    if (!Array.isArray(page)) {
      throw new Error(`Listing objects in "${bucket}" did not return an array.`);
    }
    for (const item of page) {
      if (item && typeof item.name === 'string') names.push(item.name);
    }
    if (page.length < pageSize) break;
  }
  return names;
}

async function uploadFile({ supabaseUrl, bucket, authHeaders, name, filePath, byteLength }) {
  const payload = readFileSync(filePath);
  if (payload.byteLength !== byteLength) {
    throw new Error(`Read ${payload.byteLength} bytes from ${name} but expected ${byteLength}.`);
  }
  await storageRequest(buildObjectUrl({ supabaseUrl, bucket, path: name }), {
    action: `Uploading ${name}`,
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' },
    body: payload,
    secretsToRedact: secrets,
  });
  console.log(`Uploaded ${name} (${Math.round(byteLength / 1024)} KB).`);
}

async function deleteObjects({ supabaseUrl, bucket, authHeaders, names }) {
  if (names.length === 0) return;
  await storageRequest(buildObjectUrl({ supabaseUrl, bucket, path: '' }), {
    action: `Deleting ${names.length} old object(s) from "${bucket}"`,
    method: 'DELETE',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildDeletePayload(names)),
    secretsToRedact: secrets,
  });
  console.log(`Pruned ${names.length} old object(s).`);
}

async function main() {
  const database = parseDatabaseUrl(envValue('DATABASE_URL'));
  const undumpablePort = describeUndumpablePort(database.port);
  if (undumpablePort) throw new Error(undumpablePort);
  const supabaseUrl = envValue('SUPABASE_URL');
  const serviceRoleKey = envValue('SUPABASE_SERVICE_ROLE_KEY');
  rememberSecret(serviceRoleKey);
  rememberSecret(database.password);
  const bucket = envValue('SUPABASE_BACKUP_BUCKET', 'erp-backups');
  const keep = envNumber('BACKUP_KEEP', 14);
  const maxAgeHours = envNumber('BACKUP_MAX_AGE_HOURS', 48);
  const fileSizeLimitBytes = envNumber('SUPABASE_BACKUP_MAX_BYTES', 536870912);
  const authHeaders = buildAuthHeaders(serviceRoleKey);

  if (process.argv.includes('--list')) {
    const names = await listObjects({ supabaseUrl, bucket, authHeaders });
    console.log(`${names.length} object(s) in "${bucket}":`);
    for (const name of names.slice().sort().reverse()) console.log(`  ${name}`);
    return;
  }

  await ensureBucket({ supabaseUrl, bucket, authHeaders, fileSizeLimitBytes });
  assertClientSupportsServer(database);

  const workDir = mkdtempSync(join(tmpdir(), 'erp-backup-'));
  try {
    const dumpName = buildDumpName(stampFor(new Date()));
    const sidecarName = buildExtensionSidecarName(dumpName);
    const dumpPath = join(workDir, dumpName);
    const sidecarPath = join(workDir, sidecarName);

    runTool('pg_dump', buildPgDumpArgs({ ...database, file: dumpPath }), 'pg_dump', database);
    const dumpBytes = statSync(dumpPath).size;
    if (isSuspiciouslySmallDump(dumpBytes)) {
      throw new Error(`The dump is only ${dumpBytes} bytes. An empty database is small, but so is a failed dump, and a small backup that uploads cleanly is the dangerous kind. Refusing to store it.`);
    }
    console.log(`Dumped ${database.masked} to ${dumpName} (${Math.round(dumpBytes / 1024)} KB).`);

    const extensionOutput = runTool(
      'psql',
      buildPsqlArgs({ ...database, sql: buildPortableExtensionsQuery() }),
      'reading installed extensions',
      database,
    );
    const extensions = selectPortableExtensions(extensionOutput.split('\n'));
    writeFileSync(sidecarPath, renderExtensionsSql(extensions), 'utf8');
    console.log(`Extensions recorded: ${extensions.length > 0 ? extensions.join(', ') : 'none'}`);

    await uploadFile({ supabaseUrl, bucket, authHeaders, name: dumpName, filePath: dumpPath, byteLength: dumpBytes });
    await uploadFile({
      supabaseUrl,
      bucket,
      authHeaders,
      name: sidecarName,
      filePath: sidecarPath,
      byteLength: statSync(sidecarPath).size,
    });

    const stored = await listObjects({ supabaseUrl, bucket, authHeaders });
    if (!stored.includes(dumpName)) {
      throw new Error(`${dumpName} is not in the bucket after uploading it. The backup cannot be trusted.`);
    }

    const plan = planRetention(stored, keep);
    await deleteObjects({ supabaseUrl, bucket, authHeaders, names: plan.toDelete });

    const freshness = evaluateFreshness({ dumpNames: plan.retained, now: Date.now(), maxAgeHours });
    if (!freshness.ok) {
      throw new Error(freshness.message);
    }
    console.log(freshness.message);
    console.log(`BACKUP_RESULT status=ok dump=${dumpName} bytes=${dumpBytes} bucket=${bucket} kept=${plan.retained.length}`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`BACKUP_RESULT status=failed reason=${redact(error.message)}`);
  process.exitCode = 1;
});
