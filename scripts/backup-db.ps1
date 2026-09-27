param(
  [Parameter(Position = 0)]
  [ValidateSet('backup', 'restore', 'list', 'help')]
  [string]$Action = 'backup',

  # Target database. Defaults to DATABASE_URL from the project .env, which points
  # at the live Supabase instance. Never printed in full.
  [string]$DatabaseUrl,

  [string]$OutputDir,
  [int]$Keep = 14,

  # Dumps every schema in the database, including Supabase's own (auth, storage,
  # vault, graphql_*). Only useful for restoring back into the SAME Supabase
  # project: those objects reference extensions like supabase_vault that do not
  # exist on any other PostgreSQL host, and the restore fails there. Leave this
  # off for a portable backup. The ERP keeps all of its data in 'public'.
  [switch]$AllSchemas,

  # Required for 'restore'. The script will not overwrite a live database without
  # -Confirm, and will not overwrite the .env database at all without -AllowLive.
  [switch]$Confirm,
  [switch]$AllowLive
)

<#
.SYNOPSIS
  Logical backup and restore for the ERP database (Supabase in production).

.DESCRIPTION
  A dump is a self-contained, restorable snapshot of one database: schema and
  every row. It is the artifact you hand to a restore, and the artifact that
  survives a mistake like a bad migration.

  This is deliberately NOT a substitute for Supabase's own automated backups and
  point-in-time recovery, which are physical and run server-side. Use those as
  your primary safety net and treat this script as a portable, human-readable
  copy you can keep elsewhere and restore to any PostgreSQL host. Both together
  is the point: one lives with the database, one lives off it.

.EXAMPLE
  npm run db:backup

.EXAMPLE
  scripts/backup-db.ps1 list

.EXAMPLE
  scripts/backup-db.ps1 restore -OutputDir backups -Confirm
#>

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pgBase = Join-Path $env:USERPROFILE '.edu-erp-postgres'
$bin = Join-Path $pgBase 'pgsql\bin'
$pgDump = Join-Path $bin 'pg_dump.exe'
$pgRestore = Join-Path $bin 'pg_restore.exe'

if ($Action -eq 'help') { Get-Help $PSCommandPath -Detailed; return }

function Resolve-DbUrl {
  if ($DatabaseUrl) { return $DatabaseUrl }
  if ($env:DATABASE_URL) { return $env:DATABASE_URL }
  $envFile = Join-Path $root '.env'
  if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
      if ($line -match '^\s*DATABASE_URL\s*=\s*(.+?)\s*$') {
        return $Matches[1].Trim().Trim('"').Trim("'")
      }
    }
  }
  throw 'No DATABASE_URL found. Set it in .env, in the environment, or pass -DatabaseUrl.'
}

# The live database, used to decide whether a restore needs -AllowLive. Read
# before -DatabaseUrl can shadow it, so an override can never quietly look safe.
function Get-LiveUrl {
  $envFile = Join-Path $root '.env'
  if (-not (Test-Path $envFile)) { return $null }
  foreach ($line in Get-Content $envFile) {
    if ($line -match '^\s*DATABASE_URL\s*=\s*(.+?)\s*$') {
      return $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
  return $null
}

function ConvertTo-PgParts([string]$url) {
  $u = [Uri]$url
  $userInfo = $u.UserInfo -split ':', 2
  if ($userInfo.Count -lt 2) { throw "DATABASE_URL has no password; cannot connect." }
  $db = [Uri]::UnescapeDataString($u.AbsolutePath.Trim('/'))
  return [pscustomobject]@{
    Host    = $u.Host
    Port    = if ($u.Port -gt 0) { $u.Port } else { 5432 }
    User    = [Uri]::UnescapeDataString($userInfo[0])
    Pass    = [Uri]::UnescapeDataString($userInfo[1])
    Db      = $db
    # Windows PowerShell 5.1 will not interpolate "${x[0]}", only "$(x[0])".
    # Getting this wrong once silently blanked the username, so build it here.
    Masked  = "postgresql://$([Uri]::UnescapeDataString($userInfo[0])):***@$($u.Host):$($u.Port)/$db"
  }
}

if ($Action -eq 'list') {
  $dir = if ($OutputDir) { $OutputDir } else { Join-Path $root 'backups' }
  if (-not (Test-Path $dir)) { Write-Output "No backups directory at $dir"; return }
  $files = Get-ChildItem -Path $dir -Filter '*.dump' -ErrorAction SilentlyContinue | Sort-Object Name
  if (-not $files) { Write-Output "No backups found in $dir"; return }
  $files | ForEach-Object {
    $mb = [math]::Round($_.Length / 1MB, 2)
    "{0}  {1,9} MB  {2}" -f $_.Name, $mb, $_.LastWriteTime.ToString('yyyy-MM-dd HH:mm')
  }
  return
}

$pg = ConvertTo-PgParts (Resolve-DbUrl)
$live = Get-LiveUrl
$isLive = $false
if ($live) {
  $liveParts = ConvertTo-PgParts $live
  $isLive = ($liveParts.Host -eq $pg.Host -and $liveParts.Db -eq $pg.Db)
}

# pg_dump speaks the full protocol and cannot use a transaction-pooled
# connection. Supabase's transaction pooler is 6543; 5432 is session mode or
# direct, and either works. Failing here beats a confusing mid-dump error.
if ($pg.Port -eq 6543) {
  throw "Port 6543 is Supabase's transaction pooler and pg_dump cannot use it. Use the session pooler or direct connection (port 5432) in DATABASE_URL."
}

if (-not (Test-Path $pgDump)) { throw "pg_dump not found at $pgDump" }
if (-not (Test-Path $pgRestore)) { throw "pg_restore not found at $pgRestore" }

# Destructive-action guards run BEFORE any network access, so a mistaken or
# automated invocation can never even reach the live database.
if ($Action -eq 'restore') {
  if (-not $Confirm) {
    throw 'Restore overwrites the target database and drops the objects already in it. Re-run with -Confirm once you are sure.'
  }
  if ($isLive -and -not $AllowLive) {
    throw "This is the live database from .env ($($pg.Masked)). Restoring will destroy its current contents. Re-run with -AllowLive if you are certain, and take a backup first."
  }
}

# Must be set before anything connects. Passing the password on the command line
# instead would expose it in the process list to every user on the machine.
$env:PGPASSWORD = $pg.Pass

$psql = Join-Path $bin 'psql.exe'

# Native PostgreSQL tools write NOTICEs to stderr on perfectly successful runs
# (a dropped schema cascading to an extension is routine). Under
# $ErrorActionPreference = 'Stop' that turns into a terminating error, which
# would kill an unattended backup that had in fact worked. So every native call
# goes through here: stderr is captured, never treated as failure, and only a
# non-zero exit code counts as an error.
function Invoke-DbTool {
  param(
    [Parameter(Mandatory = $true)][string]$Exe,
    [Parameter(Mandatory = $true)][string[]]$ToolArgs,
    [Parameter(Mandatory = $true)][string]$What
  )
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $errFile = [IO.Path]::GetTempFileName()
  try {
    $out = & $Exe @ToolArgs 2>$errFile
    $code = $LASTEXITCODE
    $err = Get-Content $errFile -Raw -ErrorAction SilentlyContinue
  } finally {
    $ErrorActionPreference = $prev
    Remove-Item $errFile -Force -ErrorAction SilentlyContinue
  }
  if ($code -ne 0) { throw "${What} failed (exit ${code}).`n$err" }
  return $out
}

function Get-PsqlText {
  param($Pg, [string]$Sql, [switch]$AllowFailure)
  $t = @('-h', $Pg.Host, '-p', $Pg.Port, '-U', $Pg.User, '-d', $Pg.Db, '-w', '-tAc', $Sql)
  if ($AllowFailure) {
    $prev = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { $r = & $psql @t 2>$null } finally { $ErrorActionPreference = $prev }
    if ($LASTEXITCODE -ne 0) { return @() }
    return $r
  }
  return @(Invoke-DbTool -Exe $psql -ToolArgs $t -What 'psql')
}

# Extensions the ERP's indexes and types depend on. The source database is asked
# which ones it has, because guessing here would rot the first time a column
# starts using, say, unaccent.
$EXTENSION_DENYLIST = '^(supabase_|pgsodium|pg_graphql|pg_stat_statements|plpgsql)'

function Get-PortableExtensions {
  param($Pg)
  $q = "SELECT extname FROM pg_extension WHERE extname !~ '$EXTENSION_DENYLIST' ORDER BY extname;"
  $res = Get-PsqlText -Pg $Pg -Sql $q -AllowFailure
  if (-not $res) { return @() }
  return @($res | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

# pg_dump must be at least as new as the server it reads; older refuses to run.
# Best effort: if the probe cannot connect, say so and let pg_dump produce the
# real error rather than failing on a diagnostic.
if ($Action -eq 'backup' -and (Test-Path $psql)) {
  $raw = Get-PsqlText -Pg $pg -Sql 'SHOW server_version;' -AllowFailure
  if ($raw) {
    $dumpVersion = [int]((& $pgDump --version) -replace '.*?(\d+)\.\d+.*', '$1')
    $serverVersion = [int](($raw | Select-Object -First 1) -replace '^(\d+).*', '$1')
    if ($dumpVersion -lt $serverVersion) {
      throw "pg_dump is $dumpVersion but the server is $serverVersion. pg_dump must be at least as new as the server. Install a newer PostgreSQL client."
    }
    Write-Output "Connected. pg_dump $dumpVersion, server $serverVersion."
  } else {
    Write-Warning 'Could not read the server version; proceeding anyway.'
  }
}


if ($Action -eq 'backup') {
  $dir = if ($OutputDir) { $OutputDir } else { Join-Path $root 'backups' }
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $file = Join-Path $dir "erp-$stamp.dump"

  # Not $args: that is an automatic variable inside a PowerShell function.
  $dumpArgs = @(
    '-h', $pg.Host, '-p', $pg.Port, '-U', $pg.User, '-d', $pg.Db,
    '--format=custom', '--compress=9', '--no-owner', '--no-privileges', "--file=$file"
  )
  if (-not $AllSchemas) {
    # Portable by default. See the -AllSchemas note above.
    $dumpArgs += @('--schema=public')
  }

  Write-Output "Backing up $($pg.Masked)"
  Invoke-DbTool -Exe $pgDump -ToolArgs $dumpArgs -What 'pg_dump' | Out-Null

  $size = [math]::Round((Get-Item $file).Length / 1KB, 1)
  if ((Get-Item $file).Length -lt 1024) {
    Write-Warning "Dump is only ${size} KB. An empty database backs up small, but a connection or schema error can also produce this. Verify it with 'restore' into a scratch database."
  }
  Write-Output "Wrote $file (${size} KB)"

  # A dump that references an operator class it does not create is not
  # self-contained: restoring it into a fresh database fails on the first index
  # that needs the extension. Record the extensions beside the dump so restore
  # can create them first.
  $exts = Get-PortableExtensions -Pg $pg
  if ($exts.Count -gt 0) {
    $extFile = "$file.extensions.sql"
    $lines = @(
      '-- Extensions this dump depends on, captured from the source database.',
      '-- Restore installs them into the public schema, which is where the dump',
      '-- expects their operator classes (public.gin_trgm_ops and friends).'
    ) + (
      $exts | ForEach-Object { "CREATE EXTENSION IF NOT EXISTS `"$_`" SCHEMA public;" }
    )
    Set-Content -Path $extFile -Value $lines -Encoding UTF8
    Write-Output "Extensions: $($exts -join ', ')"
  }

  # Retention. A backup nobody prunes fills the disk and then stops silently.
  $all = Get-ChildItem -Path $dir -Filter 'erp-*.dump' | Sort-Object Name -Descending
  if ($all.Count -gt $Keep) {
    $stale = $all[$Keep..($all.Count - 1)]
    foreach ($f in $stale) {
      Remove-Item $f.FullName -Force
      # The sidecar travels with its dump; leaving it behind would accumulate
      # orphaned extension files that no longer describe anything.
      $sidecar = "$($f.FullName).extensions.sql"
      if (Test-Path $sidecar) { Remove-Item $sidecar -Force }
      Write-Output "Pruned old backup $($f.Name)"
    }
  }
  Write-Output "Kept $Keep most recent."
  return
}

if ($Action -eq 'restore') {
  $dir = if ($OutputDir) { $OutputDir } else { Join-Path $root 'backups' }
  $newest = Get-ChildItem -Path $dir -Filter 'erp-*.dump' -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending | Select-Object -First 1
  if (-not $newest) { throw "No .dump files found in $dir" }

  Write-Warning "Restoring $($newest.Name) into $($pg.Masked)"

  $extFile = "$($newest.FullName).extensions.sql"
  if (-not (Test-Path $extFile)) {
    Write-Warning 'No .extensions.sql beside this dump; it may predate extension tracking and will fail on any index using an operator class.'
  }

  # The restore runs in passes, and the order is forced by two facts:
  #
  #   * The dump creates the 'public' schema itself, so 'public' must NOT already
  #     exist. That rules out pg_restore --clean, which would also try to drop it.
  #   * Indexes in the dump reference operator classes as public.gin_trgm_ops, so
  #     the extensions have to exist in 'public' before the index pass runs. They
  #     cannot be created before the schema pass, because 'public' does not exist
  #     yet. Hence: schema, then extensions, then everything else.
  #
  # Doing it in one pg_restore call does not work in any order, and getting it
  # wrong previously produced a restore that exited 0 having created nothing.
  Invoke-DbTool -Exe $psql -ToolArgs @(
    '-h', $pg.Host, '-p', $pg.Port, '-U', $pg.User, '-d', $pg.Db, '-w', '-q',
    '-c', 'DROP SCHEMA IF EXISTS public CASCADE;'
  ) -What 'Resetting the public schema in the target' | Out-Null

  $common = @('-h', $pg.Host, '-p', $pg.Port, '-U', $pg.User, '-d', $pg.Db,
    '--no-owner', '--no-privileges', '--exit-on-error')

  Invoke-DbTool -Exe $pgRestore -ToolArgs ($common + @('--section=pre-data', $newest.FullName)) `
    -What 'pg_restore (schema)' | Out-Null

  if (Test-Path $extFile) {
    Invoke-DbTool -Exe $psql -ToolArgs @(
      '-h', $pg.Host, '-p', $pg.Port, '-U', $pg.User, '-d', $pg.Db, '-w', '-q',
      '-v', 'ON_ERROR_STOP=1', '-f', $extFile
    ) -What 'Creating the extensions this dump needs (install the PostgreSQL contrib packages if this fails)' | Out-Null
    Write-Output 'Created required extensions.'
  }

  Invoke-DbTool -Exe $pgRestore -ToolArgs ($common + @('--data-only', $newest.FullName)) `
    -What 'pg_restore (data)' | Out-Null
  Invoke-DbTool -Exe $pgRestore -ToolArgs ($common + @('--section=post-data', $newest.FullName)) `
    -What 'pg_restore (indexes and constraints)' | Out-Null

  # A restore that reports success but produced no tables is the one failure
  # mode that would go unnoticed until it mattered, so assert the outcome.
  $check = Get-PsqlText -Pg $pg -Sql "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE';" -AllowFailure
  $tableCount = if ($check) { [int]($check | Select-Object -First 1) } else { 0 }
  if ($tableCount -eq 0) {
    throw 'The restore finished without error but the target has no tables. Treat this dump as unusable and do not rely on it.'
  }
  Write-Output "Restore complete. $tableCount tables present."
  return
}
