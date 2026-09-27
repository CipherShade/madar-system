param(
  [Parameter(Position = 0)]
  [ValidateSet('setup', 'reset', 'url')]
  [string]$Action = 'setup'
)

# Provisions the disposable PostgreSQL database used by tests/integration/db.
#
# That suite is destructive: it empties every business table on each run. It is
# kept on a separate database from the app's real DATABASE_URL (which points at
# a live Supabase instance), and the suite additionally refuses to run unless the
# database name contains "test".

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pgBase = Join-Path $env:USERPROFILE '.edu-erp-postgres'
$bin = Join-Path $pgBase 'pgsql\bin'
$psql = Join-Path $bin 'psql.exe'

$superUrl = 'postgresql://postgres:postgrespassword@127.0.0.1:5432/postgres?schema=public'
$dbName = 'edu_center_erp_test'
$testUrl = "postgresql://postgres:postgrespassword@127.0.0.1:5432/${dbName}?schema=public"

if ($Action -eq 'url') {
  Write-Output $testUrl
  return
}

if (-not (Test-Path $psql)) {
  throw "psql not found at $psql. Start the local server first: npm run db:start"
}

if ($Action -eq 'reset') {
  $env:PGPASSWORD = 'postgrespassword'
  & $psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -w -c "DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);" | Out-Null
  Write-Output "Dropped ${dbName}."
}

$env:PGPASSWORD = 'postgrespassword'
$exists = & $psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -w -tAc "SELECT 1 FROM pg_database WHERE datname='${dbName}';"
if ($exists -ne '1') {
  & $psql -h 127.0.0.1 -p 5432 -U postgres -d postgres -w -c "CREATE DATABASE ${dbName};" | Out-Null
  Write-Output "Created ${dbName}."
} else {
  Write-Output "${dbName} already exists."
}

# Apply migrations to the test database only. DATABASE_URL is overridden in this
# process so `prisma migrate deploy` can never touch the real database.
$env:DATABASE_URL = $testUrl
Push-Location $root
try {
  npx prisma migrate deploy 2>&1 | Select-String -Pattern 'migration|Datasource|Error' | ForEach-Object { "  $($_.Line)" }
  if ($LASTEXITCODE -ne 0) { throw 'prisma migrate deploy failed' }
} finally {
  Pop-Location
  $env:DATABASE_URL = $null
}

Write-Output ''
Write-Output "Test database ready. Run the suite with:"
Write-Output "  `$env:TEST_DATABASE_URL='${testUrl}'"
Write-Output '  npm run test:integration'
