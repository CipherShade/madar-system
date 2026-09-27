param(
    [switch]$DryRun
)

<#
.SYNOPSIS
  Seed the Educational Center ERP database with the initial Admin + reference data.

.DESCRIPTION
  Requires DATABASE_URL, and in production requires SEED_ADMIN_PASSWORD,
  SEED_RECEPTIONIST_PASSWORD (and SEED_SUPER_ADMIN_PASSWORD for the platform
  administrator) — the seed refuses to run without them in production.
  Run this ONCE against an empty database. Do not re-run in production unless you
  intend to ensure the reference users/rooms exist (seed is idempotent for users
  and rooms via upsert; teachers/students are inserted with unique codes).

.EXAMPLE
  $env:DATABASE_URL = "postgresql://user:pass@host:5432/prod?schema=public"
  $env:SEED_ADMIN_PASSWORD = "<long-random>"
  $env:SEED_RECEPTIONIST_PASSWORD = "<long-random>"
  $env:SEED_SUPER_ADMIN_PASSWORD = "<long-random>"
  powershell -File scripts/seed.ps1
#>

if ($DryRun) {
    Write-Host "Dry-run: would run: npm run db:seed"
    Write-Host "Required env: DATABASE_URL, SEED_ADMIN_PASSWORD, SEED_RECEPTIONIST_PASSWORD, SEED_SUPER_ADMIN_PASSWORD (production)"
    exit 0
}

if (-not $env:DATABASE_URL) {
    Write-Error "DATABASE_URL is required."
    exit 1
}

npm run db:seed
exit $LASTEXITCODE
