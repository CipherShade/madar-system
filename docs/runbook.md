# Production Operations Runbook (Backup · Restore · Rollback · Staging)

This runbook covers the operational procedures that complete **PROMPT 12 — Production Deployment Preparation**. The application code, build, migrations, health endpoint, secure cookies, CORS/CSRF, Socket.io auth, logs, graceful shutdown, and error handling are already implemented and tested in the repository (see `docs/deployment.md` and `docs/progress.md`). This document is the **ops checklist** for actually running the service and recovering it.

> ⚠️ **Status — READY IN CODE, NOT YET DEPLOYED.** Everything here is verified to build and pass tests in this repo. Live provisioning (hosted PostgreSQL, hosting provider, custom domain) has not been performed.

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
| CI | `.github/workflows/ci.yml` | Build + `prisma validate` + backend/frontend tests + Docker image build. |
| Deploy (manual) | `.github/workflows/deploy.yml` | Manual `workflow_dispatch` deploy stub (provider secrets required). |
| Render blueprint | `render.yaml` | Hosting blueprint with prod build/start/health-check and secret generation. |

**Required commands (verified green in this repo):**
```powershell
npm ci --include=dev
npm run build:production        # prisma generate + tsc -b && vite build + tsc -p tsconfig.server.json
npm test                        # 143 backend tests
npm run test:frontend           # 25 Vitest tests
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

## 2. Database Setup (Hosted PostgreSQL)

1. Provision a **PostgreSQL 15+** instance (e.g. Supabase, Neon, Railway, RDS).
2. Create a dedicated database for the ERP.
3. Copy the **private** connection string into `DATABASE_URL` (never paste into public files or chat).
4. Make the migration process owned by a role with `CREATE` permissions on that schema (Prisma needs it for migrations).

---

## 3. Migration Process (safe)

Use `prisma migrate deploy` only — never `db push` / `migrate dev` / `migrate reset` for a deployed DB.

```powershell
$env:DATABASE_URL = "<private-url>"
npm run db:migrate:deploy     # or: powershell -File scripts/migrate.ps1
npm run db:migrate:status     # confirm every migration is Applied
npx prisma validate
npx prisma generate
```

- Migrations are run automatically by `npm run start:production` before the server starts.
- On Render this is wired as `startCommand`; in Docker the staging image runs `npx prisma migrate deploy` then starts `node`.

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
- Schedule regular backups (host-managed snapshots e.g. Supabase backups, or a cron that runs `scripts/backup.ps1`).
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
- Keep the last known-good image tag / release. On Render/Railway, re-deploy the previous deploy.

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

## 9. Remaining Deployment Blockers (why "ready in code" ≠ "deployed")

These require external accounts/resources and cannot be completed from inside this repository:

1. Provision a **hosted PostgreSQL** instance and supply its private `DATABASE_URL`.
2. **Apply migrations** to that hosted DB and confirm `db:migrate:status`.
3. **Deploy** to a hosting provider (Render/Railway/etc.), storing `JWT_SECRET`, `COOKIE_SECRET`, `CORS_ORIGIN` in its secret store.
4. Verify **provider-level HTTPS** termination and **WebSocket upgrade** through the provider (the `render.yaml` health check already points at `/api/health`).
5. Register a **custom domain** + auto-renewing TLS certificate.
6. Configure **uptime/error monitoring** and **scheduled + tested backups**.
7. Run a **staging acceptance** and a full **backup-restore + rollback drill** against real services.
