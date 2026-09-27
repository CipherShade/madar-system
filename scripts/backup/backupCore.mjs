import { createHash, createHmac } from 'node:crypto';

const DUMP_PREFIX = 'erp-';
const DUMP_SUFFIX = '.dump';
const EXTENSION_SIDECAR_SUFFIX = '.extensions.sql';
const PORTABLE_EXTENSION_DENYLIST = /^(supabase_|pgsodium|pg_graphql|pg_stat_statements|plpgsql)/;
const SAFE_SQL_IDENTIFIER = /^[a-z_][a-z0-9_-]*$/;
const DUMP_STAMP = /^erp-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.dump$/;
const MS_PER_HOUR = 3600000;
const SIGV4_ALGORITHM = 'AWS4-HMAC-SHA256';
const S3_SERVICE = 's3';

export function buildDumpName(stamp) {
  return `${DUMP_PREFIX}${stamp}${DUMP_SUFFIX}`;
}

export function buildExtensionSidecarName(dumpName) {
  return `${dumpName}${EXTENSION_SIDECAR_SUFFIX}`;
}

export function isDumpName(name) {
  return name.startsWith(DUMP_PREFIX) && name.endsWith(DUMP_SUFFIX);
}

export function isExtensionSidecarName(name) {
  return name.startsWith(DUMP_PREFIX) && name.endsWith(EXTENSION_SIDECAR_SUFFIX);
}

export function dumpNameOfSidecar(sidecarName) {
  if (!isExtensionSidecarName(sidecarName)) return null;
  return sidecarName.slice(0, -EXTENSION_SIDECAR_SUFFIX.length);
}

export function parseDumpStamp(name) {
  const match = DUMP_STAMP.exec(name);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const stamp = Date.UTC(year, month - 1, day, hour, minute, second);
  const roundTrip = new Date(stamp);
  if (roundTrip.getUTCFullYear() !== year) return null;
  if (roundTrip.getUTCMonth() !== month - 1) return null;
  if (roundTrip.getUTCDate() !== day) return null;
  return stamp;
}

export function parseDatabaseUrl(rawUrl) {
  if (!rawUrl || !rawUrl.trim()) {
    throw new Error('DATABASE_URL is empty. The backup cannot run without it.');
  }
  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error('DATABASE_URL is not a valid connection URL.');
  }
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  if (!user) throw new Error('DATABASE_URL has no username.');
  if (!password) throw new Error('DATABASE_URL has no password.');
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) throw new Error('DATABASE_URL has no database name.');
  const port = url.port ? Number(url.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`DATABASE_URL has an unusable port: ${url.port}`);
  }
  return {
    host: url.hostname,
    port,
    user,
    password,
    database,
    masked: `postgresql://${user}:***@${url.hostname}:${port}/${database}`,
  };
}

export function describeUndumpablePort(port) {
  if (Number(port) === 6543) {
    return "DATABASE_URL points at port 6543, which is Supabase's transaction pooler. pg_dump cannot use it, because a dump is one long-lived session and the transaction pooler hands back a different backend for each one. Use the session pooler on port 5432, or a direct connection.";
  }
  return null;
}

export function buildPgDumpArgs({ host, port, user, database, file, allSchemas = false }) {
  const args = [
    '-h', host,
    '-p', String(port),
    '-U', user,
    '-d', database,
    '--format=custom',
    '--compress=9',
    '--no-owner',
    '--no-privileges',
    `--file=${file}`,
  ];
  if (!allSchemas) args.push('--schema=public');
  return args;
}

export function buildPsqlArgs({ host, port, user, database, sql }) {
  return ['-h', host, '-p', String(port), '-U', user, '-d', database, '-w', '-tAc', sql];
}

export function buildPortableExtensionsQuery() {
  return "SELECT extname FROM pg_extension WHERE extname !~ '^(supabase_|pgsodium|pg_graphql|pg_stat_statements|plpgsql)' ORDER BY extname;";
}

export function isPortableExtension(name) {
  return !PORTABLE_EXTENSION_DENYLIST.test(name);
}

export function selectPortableExtensions(names) {
  return names
    .map((name) => String(name).trim())
    .filter((name) => name.length > 0 && isPortableExtension(name));
}

export function isSafeSqlIdentifier(name) {
  return SAFE_SQL_IDENTIFIER.test(name);
}

export function renderExtensionsSql(extensions) {
  const unsafe = extensions.filter((name) => !isSafeSqlIdentifier(name));
  if (unsafe.length > 0) {
    throw new Error(`Refusing to write an extension sidecar for an unexpected name: ${unsafe.join(', ')}`);
  }
  const lines = [
    '-- Extensions this dump depends on, captured from the source database.',
    '-- Restore installs them into the public schema, which is where the dump',
    '-- expects their operator classes (public.gin_trgm_ops and friends).',
  ];
  for (const name of extensions) {
    lines.push(`CREATE EXTENSION IF NOT EXISTS "${name}" SCHEMA public;`);
  }
  return `${lines.join('\n')}\n`;
}

export function planRetention(objectNames, keep) {
  if (!Number.isInteger(keep) || keep < 1) {
    throw new Error(`BACKUP_KEEP must be a whole number of at least 1, got ${JSON.stringify(keep)}`);
  }
  const dumps = objectNames.filter(isDumpName).sort().reverse();
  const retainedDumps = new Set(dumps.slice(0, keep));
  const doomed = new Set(dumps.slice(keep));
  for (const name of objectNames) {
    if (!isExtensionSidecarName(name)) continue;
    const base = dumpNameOfSidecar(name);
    if (base && !retainedDumps.has(base)) doomed.add(name);
  }
  return { retained: [...retainedDumps], toDelete: [...doomed].sort() };
}

export function evaluateFreshness({ dumpNames, now, maxAgeHours }) {
  if (!Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
    throw new Error(`BACKUP_MAX_AGE_HOURS must be a positive number, got ${JSON.stringify(maxAgeHours)}`);
  }
  const stamps = dumpNames
    .filter(isDumpName)
    .map(parseDumpStamp)
    .filter((stamp) => stamp !== null)
    .sort((a, b) => a - b);
  if (stamps.length === 0) {
    return { ok: false, ageHours: Number.POSITIVE_INFINITY, newest: null, message: 'No backup dump exists in storage.' };
  }
  const newest = stamps[stamps.length - 1];
  const ageHours = (now - newest) / MS_PER_HOUR;
  const ok = ageHours <= maxAgeHours;
  return {
    ok,
    ageHours,
    newest,
    message: ok
      ? `Newest backup is ${ageHours.toFixed(1)}h old, within the ${maxAgeHours}h limit.`
      : `Newest backup is ${ageHours.toFixed(1)}h old, past the ${maxAgeHours}h limit. Backups are stale.`,
  };
}

export function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

function hmacSha256(key, data) {
  return createHmac('sha256', key).update(data).digest();
}

export function encodeRfc3986(value) {
  return encodeURIComponent(String(value)).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

export function buildCanonicalQueryString(entries) {
  return entries
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)])
    .sort((a, b) => {
      if (a[0] !== b[0]) return a[0] < b[0] ? -1 : 1;
      if (a[1] !== b[1]) return a[1] < b[1] ? -1 : 1;
      return 0;
    })
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

export function normalizeS3Endpoint(rawEndpoint) {
  if (!rawEndpoint || !rawEndpoint.trim()) {
    throw new Error('BACKUP_S3_ENDPOINT is empty. Copy the endpoint from the storage bucket page in Railway.');
  }
  let url;
  try {
    url = new URL(rawEndpoint.trim());
  } catch {
    throw new Error('BACKUP_S3_ENDPOINT is not a valid URL.');
  }
  if (url.protocol !== 'https:') {
    throw new Error(`BACKUP_S3_ENDPOINT must be https, got ${url.protocol.replace(':', '')}. Credentials must never cross an unencrypted connection.`);
  }
  return {
    origin: url.origin,
    host: url.host,
    basePath: url.pathname.replace(/\/+$/, ''),
  };
}

export function resolvePathStyle({ endpointHost, bucket, override }) {
  if (override === true || override === false) return override;
  const firstLabel = String(endpointHost).split('.')[0];
  return firstLabel === bucket;
}

export function buildS3Url({ endpoint, bucket, key = '', pathStyle }) {
  const host = pathStyle ? endpoint.host : `${bucket}.${endpoint.host}`;
  const prefix = pathStyle ? endpoint.basePath : '';
  const path = key ? `${prefix}/${encodeRfc3986(key)}` : prefix || '/';
  const scheme = endpoint.origin.slice(0, endpoint.origin.indexOf('://'));
  return { url: `${scheme}://${host}${path === '' ? '/' : path}`, host };
}

export function buildListObjectsQuery({ prefix = '', maxKeys = 1000, continuationToken = null }) {
  const entries = [
    ['list-type', '2'],
    ['max-keys', String(maxKeys)],
  ];
  if (prefix) entries.push(['prefix', prefix]);
  if (continuationToken) entries.push(['continuation-token', continuationToken]);
  return buildCanonicalQueryString(entries);
}

export function buildCanonicalRequest({ method, canonicalUri, canonicalQueryString, headers, signedHeaderNames, payloadHash }) {
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${String(headers[name]).trim()}\n`).join('');
  return [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaderNames.join(';'),
    payloadHash,
  ].join('\n');
}

export function buildStringToSign({ amzDate, scope, canonicalRequest }) {
  return [SIGV4_ALGORITHM, amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
}

export function deriveSigningKey({ secretAccessKey, dateStamp, region, service = S3_SERVICE }) {
  const dateKey = hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmacSha256(dateKey, region);
  const serviceKey = hmacSha256(regionKey, service);
  return hmacSha256(serviceKey, 'aws4_request');
}

export function formatAmzDate(date) {
  return date.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '');
}

export function signS3Request({
  method,
  url,
  headers = {},
  payloadHash,
  accessKeyId,
  secretAccessKey,
  region,
  service = S3_SERVICE,
  now = new Date(),
}) {
  if (!accessKeyId || !accessKeyId.trim()) {
    throw new Error('BACKUP_S3_ACCESS_KEY_ID is empty. Copy the access key from the storage bucket page in Railway.');
  }
  if (!secretAccessKey || !secretAccessKey.trim()) {
    throw new Error('BACKUP_S3_SECRET_ACCESS_KEY is empty. Copy the secret key from the storage bucket page in Railway.');
  }
  if (!region || !region.trim()) {
    throw new Error('BACKUP_S3_REGION is empty. Copy the region from the storage bucket page in Railway.');
  }
  const target = new URL(url);
  const amzDate = formatAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${region.trim()}/${service}/aws4_request`;

  const requestHeaders = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined || value === null) continue;
    requestHeaders[name.toLowerCase()] = String(value).trim();
  }
  requestHeaders.host = target.host;
  requestHeaders['x-amz-content-sha256'] = payloadHash;
  requestHeaders['x-amz-date'] = amzDate;

  const signedHeaderNames = Object.keys(requestHeaders).sort();
  const canonicalQueryString = buildCanonicalQueryString([...target.searchParams.entries()]);
  const canonicalRequest = buildCanonicalRequest({
    method,
    canonicalUri: target.pathname || '/',
    canonicalQueryString,
    headers: requestHeaders,
    signedHeaderNames,
    payloadHash,
  });
  const stringToSign = buildStringToSign({ amzDate, scope, canonicalRequest });
  const signingKey = deriveSigningKey({ secretAccessKey: secretAccessKey.trim(), dateStamp, region: region.trim(), service });
  const signature = createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

  return {
    ...requestHeaders,
    Authorization:
      `${SIGV4_ALGORITHM} Credential=${accessKeyId.trim()}/${scope}, ` +
      `SignedHeaders=${signedHeaderNames.join(';')}, Signature=${signature}`,
  };
}

const XML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function decodeXmlEntities(text) {
  return String(text).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      return String.fromCodePoint(parseInt(entity.slice(2), 16));
    }
    if (entity.startsWith('#')) {
      return String.fromCodePoint(parseInt(entity.slice(1), 10));
    }
    return XML_ENTITIES[entity] ?? match;
  });
}

export function parseListObjectsResult(xml) {
  const names = [];
  const keyPattern = /<Key>([\s\S]*?)<\/Key>/g;
  let match = keyPattern.exec(xml);
  while (match !== null) {
    names.push(decodeXmlEntities(match[1]));
    match = keyPattern.exec(xml);
  }
  const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml);
  const tokenMatch = /<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/.exec(xml);
  return {
    names,
    isTruncated: truncated,
    nextContinuationToken: tokenMatch ? decodeXmlEntities(tokenMatch[1]) : null,
  };
}

const S3_ERROR_HINTS = {
  SignatureDoesNotMatch:
    'The signature was rejected. This is almost always BACKUP_S3_REGION: S3 signs each request against a region, and the wrong one produces exactly this error. Copy the region shown on the bucket page.',
  AccessDenied: 'The access key was refused. Check that the key belongs to this bucket and has write access.',
  NoSuchBucket: 'The bucket does not exist at that endpoint. Check BACKUP_S3_BUCKET and the endpoint.',
  InvalidAccessKeyId: 'The access key id is not recognised. It is usually truncated when pasted.',
};

export function describeS3Failure(action, status, body, secrets = []) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  const code = /<Code>([^<]+)<\/Code>/.exec(raw)?.[1];
  const hint = code ? S3_ERROR_HINTS[code] : null;
  const trimmed = raw.length > 300 ? `${raw.slice(0, 300)}...` : raw;
  const base = `${action} failed with HTTP ${status}${code ? ` (${code})` : ''}`;
  return redactSecrets(`${base}${hint ? `: ${hint}` : ''}${trimmed ? ` [${trimmed}]` : ''}`, secrets);
}

export function redactSecrets(text, secrets) {
  let output = String(text ?? '');
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret.length >= 8) {
      output = output.split(secret).join('***');
    }
  }
  return output;
}

export function describeStorageFailure(action, status, body, secrets = []) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  const trimmed = raw.length > 400 ? `${raw.slice(0, 400)}...` : raw;
  return redactSecrets(`${action} failed with HTTP ${status}${trimmed ? `: ${trimmed}` : ''}`, secrets);
}

export function isSuspiciouslySmallDump(byteLength) {
  return byteLength < 1024;
}
