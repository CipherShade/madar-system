# Production Operations Runbook (Backup · Restore · Rollback · Staging)

This runbook covers the operational procedures that complete **PROMPT 12 — Production Deployment Preparation**. The application code, build, migrations, health endpoint, secure cookies, CORS/CSRF, Socket.io auth, logs, graceful shutdown, and error handling are already implemented and tested in the repository (see `docs/deployment.md` and `docs/progress.md`). This document is the **ops checklist** for actually running the service and recovering it.

> **Status — LIVE ON RAILWAY.** Production is deployed: the `er` service, the `Postgres` service, and the `er-backup` cron service all build from this repository's `main` branch. Everything below is verified to build and pass tests in this repo, and describes the running system.

---

## 0. Deployed Artifacts & Files

| Artifact | Path | Purpose |
| :--- | :--- | :--- |
| Single-origin service image | `Dockerfile` | Builds SPA + API + Socket.io into one production container, incl. `pg_dump`/`pg_restore`/`psql` for ops. |
| Ignore rules | `.dockerignore` | Keeps secrets, tests, docs, logs and build output out of the image. |
| Staging stack | `docker-compose.staging.yml` | Wires the production image + PostgreSQL together for full verification before a live deploy. |
| Backup script | `scripts/backup.ps1` | `pg_dump --format=custom` -> dated `.dump`. |
| Restore script | `scripts/restore.ps1` | `pg_restore --clean --if-exists` into a target DB. |
| Migration script | `scripts/migrate.ps1` | `prisma migrate deploy` + status (safe, non-destructive). |
| Seed script wrapper | `scripts/seed.ps1` | Guards production seeding incl. required passwords. |
| CI | `.github/workflows/ci.yml` | Build + `prisma validate` + migrations + backend/frontend tests + Docker image build. Runs on push/PR to `main`. It does not deploy. |
| Deploy (manual) | Railway dashboard / `railway up` | Re-run the last successful deployment. There is no in-repo deploy script: Railway builds from the repo on push, so a redeploy is a Railway action. |

**Required commands (verified green in this repo):**
```powershell
npm ci --include=dev
npm run build:production        # prisma generate + tsc -b && vite build + tsc -p tsconfig.server.json
npm test                        # backend suite (node:test via tsx)
npm run test:frontend           # frontend suite (Vitest)
```

**Start command (also runs migrations first):**
```powershell
npm run start:production        # prisma migrate deploy && node dist/server/server/server.js
```

---

## 1. Required Environment Variables

Set in the **hosting provider's secret/env store**, never in a committed file:

| Variable | Required | Notes |
| :--- | :--- | :--- |
| `NODE_ENV` | yes | `production` (enables `Secure` cookies + built-in static serving + info logs). |
| `DATABASE_URL` | yes | Full hosted PostgreSQL connection string. Server refuses to start without it. |
| `JWT_SECRET` | yes | Long random token secret. |
| `COOKIE_SECRET` | yes | Long random cookie-signing secret. |
| `CORS_ORIGIN` | yes | Exact public browser origin(s), comma-separated. |
| `PORT` | no | HTTP port (host injects usually; default `3000`). |
| `JWT_EXPIRES_IN` | no | Session lifetime, default `12h`. |
| `DEFAULT_LOCALE` | no | `ar` (default) or `en`. |
| `REQUEST_BODY_LIMIT_KB`, `SOCKET_MAX_PAYLOAD_KB`, `RATE_LIMIT_*` | no | Overrides with safe defaults. |
| `SEED_ADMIN_PASSWORD`, `SEED_RECEPTIONIST_PASSWORD`, `SEED_SUPER_ADMIN_PASSWORD` | seed only | Required to seed an empty production DB. |

> Fail-fast guarantee is enforced in `src/server/config/index.ts:7` — startup exits with code 1 if any required var is missing.

---

## 2. Database Setup (Railway Postgres)

Production uses a Railway `Postgres` service, reached over Railway's private network. Steps 1–4 below are what it was created with:

1. Provision a **PostgreSQL 15+** instance (production: Railway `postgres-ssl:18`; any host works — e.g. Neon, RDS).
2. Create a dedicated database for the ERP.
3. Set `DATABASE_URL` as a Railway service variable using a reference to the `Postgres` service's private URL, so it cannot drift out of sync with the database (never paste it into public files or chat).
4. Make the migration process owned by a role with `CREATE` permissions on that schema (Prisma needs it for migrations).

---

## 3. Migration Process (safe)

Use `prisma migrate deploy` only — never `db push` / `migrate dev` / `migrate reset` for a deployed DB.

Nothing in the application changes the schema: startup probes it, and in production refuses to serve when it is behind, so applying a migration is always a decision someone makes on purpose and `db:migrate:status` afterwards is what confirms it.

```powershell
$env:DATABASE_URL = "<private-url>"
npm run db:migrate:deploy     # or: powershell -File scripts/migrate.ps1
npm run db:migrate:status     # confirm every migration is Applied
npx prisma validate
npx prisma generate
```

- Migrations are run automatically by `npm run start:production` before the server starts.
- On Railway this is the `er` service's start command, so every deploy applies pending migrations to Railway Postgres before the server accepts traffic. The `Dockerfile` `CMD` does the same inside the container.

**Seed an empty production DB once** (change passwords after first login):
```powershell
$env:SEED_ADMIN_PASSWORD = "<long-random>"
$env:SEED_RECEPTIONIST_PASSWORD = "<long-random>"
npm run db:seed               # or: powershell -File scripts/seed.ps1
```

---

## 4. Backup Strategy

Logical `pg_dump` custom-format backups are safe to take while the database is live.

**Manual:**
```powershell
$env:DATABASE_URL = "<private-url>"
powershell -File scripts/backup.ps1          # writes edu_center_erp_YYYYMMDD_HHmmss.dump
powershell -File scripts/backup.ps1 -Gzip   # optional gzip
```

**Best practice:**
- Take a backup **before** every migration/deploy, and retain the pre-change dump as the rollback artifact.
- Schedule regular backups. This is already automated in production: the `er-backup` Railway service runs daily (`0 3 * * *`), dumps Railway Postgres, uploads to the `erp-backups` bucket, prunes to the newest 14, and fails the run if the newest stored dump is stale. See `AGENTS.md` §Backups for the full rule set.
- Store dumps **off the app host**, in restricted object storage, and keep multiple dated copies.
- Test restore into a scratch DB at least quarterly and after schema changes.

---

## 5. Restore Procedure

Always restore into a **new/empty database first**, verify, then plan any live cutover:

```powershell
# 1) Create a fresh scratch DB and restore into it
$env:DATABASE_URL = "postgresql://user:pass@host:5432/edu_center_erp_restore?schema=public"
powershell -File scripts/restore.ps1 -BackupFile ./edu_center_erp_20260101.dump -Verify

# 2) Verify migration state
npm run db:migrate:status

# 3) Smoke test: login, check-in (all 3 payment methods), settlement, shift close, reports, audit
```

**Restoring over live data is destructive.** Only do it with:
- an approved maintenance window,
- a **fresh rollback backup** of the current live DB taken immediately before,
- a confirmed `pg_restore` success + smoke test.

---

## 6. Rollback Strategy

Two independent rollback axes: **application** and **database**.

### 6.1 Application rollback
- Prisma migrations are **additive/non-destructive**, so the previous app build remains compatible.
- Re-deploy the previous verified image/build (blue-green or previous release tag). Because `start:production` runs `migrate deploy`, pointing the old build at the new DB is safe as long as the schema is a superset.
- Keep the last known-good image tag / release. On Railway, re-deploy the previous deploy from the dashboard.

### 6.2 Database rollback
Prisma has no per-migration "down", so database rollback = **restore a pre-change dump**:
1. Stop the web service (prevent new writes).
2. Restore the pre-migration dump into a fresh DB and verify (Section 5).
3. Point `DATABASE_URL` at the restored DB and re-deploy the matching app build.
4. Smoke test, then re-enable traffic.
5. Do **not** restore over live data without a fresh rollback backup and an approved maintenance window.

### 6.3 Decision helper

| Symptom | Action |
| :--- | :--- |
| New app build misbehaves, schema is fine | Re-deploy previous **app** build (no DB restore). |
| Service exits 1 with "Refusing to start in production: the database schema is missing or behind schema.prisma" | The build expects a migration the database does not have. Run `npx prisma migrate status` against `DATABASE_URL` and compare with `prisma/migrations/`, apply the pending migration(s), re-deploy. The server will not repair the schema itself and must not be talked into doing so. |
| Migration broke schema / data corrupted | Full **DB restore** from pre-migration dump + matching app build. |
| Partial bad data in one table | Point-in-time recovery / targeted SQL with a fresh backup first. |

---

## 7. Staging / Deployment Simulation

This verifies the **production image** end to end (build -> migrate -> health -> Socket.io) against a disposable DB, without touching hosted services.

```powershell
# Requires Docker
# 1) Build + run the staging stack (web + postgres)
docker compose -f docker-compose.staging.yml up -d --build

# 2) Health check
Invoke-RestMethod http://localhost:3000/api/health    # expect 200, database:"ok"

# 3) Verify SPA serves
Invoke-WebRequest http://localhost:3000/ | Select-Object StatusCode

# 4) Verify Socket.io endpoint + auth (open the app in a browser, log in, check lobby sync across two windows)

# 5) Confirm migrations applied
docker compose -f docker-compose.staging.yml exec web npx prisma migrate status

# 6) Tear down (destroys the staging DB volume)
docker compose -f docker-compose.staging.yml down -v
```

For split hosting, set `VITE_API_BASE_URL` / `VITE_SOCKET_URL` **at build time** to the API host and bake them in (see `src/client/lib/config.ts`).

---

## 8. Post-Deploy Verification Checklist

- [ ] `GET /api/health` -> `200` and `database: "ok"` over **HTTPS**.
- [ ] Login over HTTPS sets a `Secure`, HTTP-only, `SameSite=Lax` cookie.
- [ ] Lobby page loads with no CORS errors.
- [ ] Socket.io connects (no polling fallback) and lobby counts sync across two desks/windows.
- [ ] Check-in with Cash, Vodafone Cash, InstaPay; duplicate check-in is rejected `409`.
- [ ] Settlement, shift close (exact/overage/shortage), reports and audit are correct.
- [ ] App works with the development laptop **off**.
- [ ] Migration status shows all migrations `Applied`; `AuditLog` and constraints present.
- [ ] A fresh backup has been taken and a restore has been tested.

---

## 9. Live Topology and Remaining Work

**Live production topology — GitHub → Railway → Railway Postgres:**

| Piece | Where | Notes |
| :--- | :--- | :--- |
| `er` | Railway service | Builds the root `Dockerfile` from `main`; start command `npm run start:production`; domain `*.up.railway.app` on port 3000. |
| `Postgres` | Railway service | `postgres-ssl:18`, private network, persistent volume. Reached by `er` through a `DATABASE_URL` reference variable. |
| `er-backup` | Railway service | Builds `Dockerfile.backup`, cron `0 3 * * *`, writes to the `erp-backups` object-storage bucket. See `AGENTS.md` §Backups. |
| CI | GitHub Actions | `.github/workflows/ci.yml` gates the push; it does not deploy. |

Done: hosted PostgreSQL provisioned, migrations applied via `prisma migrate deploy` on every deploy, the service deployed, HTTPS terminated by Railway, and daily backups with a freshness assertion running unattended.

Still to do:

1. Verify **WebSocket upgrade** end to end through Railway's proxy with two real browser sessions (§8).
2. Register a **custom domain** + auto-renewing TLS certificate.
3. Configure **uptime/error monitoring** (e.g. a Railway monitor on `/api/health` plus deploy-failure alerts).
4. Prove the backups are **restorable**, not just present: restore one into a scratch database and run §5.
5. Run a full **backup-restore + rollback drill** against the real services.
