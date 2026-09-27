const DUMP_PREFIX = 'erp-';
const DUMP_SUFFIX = '.dump';
const EXTENSION_SIDECAR_SUFFIX = '.extensions.sql';
const PORTABLE_EXTENSION_DENYLIST = /^(supabase_|pgsodium|pg_graphql|pg_stat_statements|plpgsql)/;
const SAFE_SQL_IDENTIFIER = /^[a-z_][a-z0-9_-]*$/;
const DUMP_STAMP = /^erp-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.dump$/;
const MS_PER_HOUR = 3600000;

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

export function normalizeSupabaseUrl(rawUrl) {
  if (!rawUrl || !rawUrl.trim()) {
    throw new Error('SUPABASE_URL is empty. It is the project URL, for example https://abcdefgh.supabase.co');
  }
  let url;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new Error('SUPABASE_URL is not a valid URL. It should look like https://abcdefgh.supabase.co');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`SUPABASE_URL must be http or https, got ${url.protocol}`);
  }
  return url.origin;
}

function encodePath(path) {
  return String(path).split('/').map((segment) => encodeURIComponent(segment)).join('/');
}

export function buildAuthHeaders(serviceRoleKey) {
  if (!serviceRoleKey || !serviceRoleKey.trim()) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is empty. It is the service_role key from Supabase project settings.');
  }
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
}

export function buildBucketUrl({ supabaseUrl }) {
  return `${normalizeSupabaseUrl(supabaseUrl)}/storage/v1/bucket`;
}

export function buildBucketPayload({ bucket, fileSizeLimitBytes }) {
  return {
    id: bucket,
    name: bucket,
    public: false,
    file_size_limit: fileSizeLimitBytes,
  };
}

export function buildObjectUrl({ supabaseUrl, bucket, path }) {
  return `${normalizeSupabaseUrl(supabaseUrl)}/storage/v1/object/${encodeURIComponent(bucket)}/${encodePath(path)}`;
}

export function buildListUrl({ supabaseUrl, bucket, prefix = '', limit = 1000, offset = 0 }) {
  const base = `${normalizeSupabaseUrl(supabaseUrl)}/storage/v1/object/list/${encodeURIComponent(bucket)}`;
  const query = new URLSearchParams({ prefix, limit: String(limit), offset: String(offset) });
  return `${base}?${query.toString()}`;
}

export function buildDeletePayload(paths) {
  return { prefixes: paths };
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
