#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildListObjectsQuery,
  buildS3Url,
  buildDumpName,
  buildExtensionSidecarName,
  buildPgDumpArgs,
  buildPortableExtensionsQuery,
  buildPsqlArgs,
  describeS3Failure,
  describeUndumpablePort,
  evaluateFreshness,
  isSuspiciouslySmallDump,
  parseDatabaseUrl,
  parseListObjectsResult,
  planRetention,
  redactSecrets,
  renderExtensionsSql,
  resolvePathStyle,
  selectPortableExtensions,
  sha256Hex,
  signS3Request,
  stampFor,
} from './backupCore.mjs';
import { normalizeS3Endpoint } from './backupCore.mjs';

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

function parseBooleanEnv(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw.trim() === '') return undefined;
  const value = raw.trim().toLowerCase();
  if (value === 'true' || value === '1' || value === 'yes') return true;
  if (value === 'false' || value === '0' || value === 'no') return false;
  throw new Error(`${name} must be true or false, got ${JSON.stringify(raw)}`);
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

async function s3Request({ method, url, host, headers = {}, body, action, credentials, secretsToRedact = [] }) {
  const payload = body ?? Buffer.alloc(0);
  const payloadHash = sha256Hex(payload);
  const signed = signS3Request({
    method,
    url,
    headers,
    payloadHash,
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    region: credentials.region,
  });
  let response;
  try {
    response = await fetch(url, { method, headers: signed, body: payload.byteLength > 0 ? payload : undefined });
  } catch (error) {
    throw new Error(`${action} could not reach ${host}: ${error.message}`);
  }
  const text = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(describeS3Failure(action, response.status, text, secretsToRedact));
  }
  return { response, text };
}

function storageTarget(storage, key) {
  const built = buildS3Url({
    endpoint: storage.endpoint,
    bucket: storage.bucket,
    key,
    pathStyle: storage.pathStyle,
  });
  return { url: built.url, host: built.host };
}

async function listObjects(storage, { prefix = '', pageSize = 1000 } = {}) {
  const names = [];
  let continuationToken = null;
  for (let page = 0; page < 1000; page += 1) {
    const { url, host } = storageTarget(storage, '');
    const signedUrl = `${url}?${buildListObjectsQuery({ prefix, maxKeys: pageSize, continuationToken })}`;
    const { text } = await s3Request({
      method: 'GET',
      url: signedUrl,
      host,
      action: `Listing objects in "${storage.bucket}"`,
      credentials: storage,
      secretsToRedact: secrets,
    });
    const result = parseListObjectsResult(text);
    names.push(...result.names);
    if (!result.isTruncated || !result.nextContinuationToken) break;
    continuationToken = result.nextContinuationToken;
  }
  return names;
}

async function headObject(storage, key) {
  const { url, host } = storageTarget(storage, key);
  const signed = signS3Request({
    method: 'HEAD',
    url,
    payloadHash: sha256Hex(''),
    accessKeyId: storage.accessKeyId,
    secretAccessKey: storage.secretAccessKey,
    region: storage.region,
  });
  const response = await fetch(url, { method: 'HEAD', headers: signed });
  if (!response.ok) {
    throw new Error(`Uploaded ${key} but ${response.status === 404 ? 'it is not in the bucket' : `the bucket refused to confirm it (HTTP ${response.status})`}. The backup cannot be trusted.`);
  }
  return { contentLength: Number(response.headers.get('content-length') || 0) };
}

async function uploadFile(storage, { name, filePath, byteLength }) {
  const payload = readFileSync(filePath);
  if (payload.byteLength !== byteLength) {
    throw new Error(`Read ${payload.byteLength} bytes from ${name} but expected ${byteLength}.`);
  }
  const { url, host } = storageTarget(storage, name);
  await s3Request({
    method: 'PUT',
    url,
    host,
    headers: { 'content-type': 'application/octet-stream' },
    body: payload,
    action: `Uploading ${name}`,
    credentials: storage,
    secretsToRedact: secrets,
  });
  const confirmed = await headObject(storage, name);
  if (confirmed.contentLength !== byteLength) {
    throw new Error(`Stored ${name} as ${confirmed.contentLength} bytes but uploaded ${byteLength}. The dump may have been truncated.`);
  }
  console.log(`Uploaded ${name} (${Math.round(byteLength / 1024)} KB), confirmed present.`);
}

async function deleteObjects(storage, names) {
  for (const name of names) {
    const { url, host } = storageTarget(storage, name);
    await s3Request({
      method: 'DELETE',
      url,
      host,
      action: `Deleting ${name}`,
      credentials: storage,
      secretsToRedact: secrets,
    });
  }
  if (names.length > 0) console.log(`Pruned ${names.length} old object(s).`);
}

async function main() {
  const database = parseDatabaseUrl(envValue('DATABASE_URL'));
  const undumpablePort = describeUndumpablePort(database.port);
  if (undumpablePort) throw new Error(undumpablePort);

  const accessKeyId = envValue('BACKUP_S3_ACCESS_KEY_ID');
  const secretAccessKey = envValue('BACKUP_S3_SECRET_ACCESS_KEY');
  const region = envValue('BACKUP_S3_REGION');
  const endpoint = normalizeS3Endpoint(envValue('BACKUP_S3_ENDPOINT'));
  const bucket = envValue('BACKUP_S3_BUCKET', 'erp-backups');
  const pathStyleOverride = parseBooleanEnv('BACKUP_S3_PATH_STYLE');
  rememberSecret(secretAccessKey);
  rememberSecret(accessKeyId);
  rememberSecret(database.password);

  const storage = {
    endpoint,
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    pathStyle: resolvePathStyle({ endpointHost: endpoint.host, bucket, override: pathStyleOverride }),
  };

  const keep = envNumber('BACKUP_KEEP', 14);
  const maxAgeHours = envNumber('BACKUP_MAX_AGE_HOURS', 48);

  if (process.argv.includes('--list')) {
    const names = await listObjects(storage);
    console.log(`${names.length} object(s) in "${bucket}" at ${endpoint.host}:`);
    for (const name of names.slice().sort().reverse()) console.log(`  ${name}`);
    return;
  }

  const reachable = await listObjects(storage, { pageSize: 1 });
  console.log(`Storage reachable: ${endpoint.host} (path-style: ${storage.pathStyle}), ${reachable.length} object(s) visible.`);
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

    await uploadFile(storage, { name: dumpName, filePath: dumpPath, byteLength: dumpBytes });
    await uploadFile(storage, {
      name: sidecarName,
      filePath: sidecarPath,
      byteLength: statSync(sidecarPath).size,
    });

    const stored = await listObjects(storage);
    if (!stored.includes(dumpName)) {
      throw new Error(`${dumpName} is not in the bucket after uploading it. The backup cannot be trusted.`);
    }

    const plan = planRetention(stored, keep);
    await deleteObjects(storage, plan.toDelete);

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
