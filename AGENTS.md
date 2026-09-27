# AI Agent Guidelines & Engineering Standards: Educational Center ERP

This document specifies mandatory rules, architectural constraints, and quality standards that every AI coding agent and developer MUST follow when contributing to this codebase.

---

## 1. Core Principles & Golden Rules

1. **Arabic-First & RTL Native by Default:**
   - The primary interface language is Arabic (`ar`). English (`en`) is secondary.
   - All frontend components must support **Right-to-Left (RTL)** layout natively.
   - Never hardcode UI text in components. Always extract strings into translation dictionaries under `src/client/locales/ar/` and `src/client/locales/en/`.
   - Use directional Tailwind classes (`start-`, `end-`, `ms-`, `me-`, `ps-`, `pe-`, `text-start`, `text-end`) instead of absolute directional classes (`left-`, `right-`, `ml-`, `mr-`, `text-left`).
   - Primary Arabic web font is **Cairo**; ensure typography remains clean, readable, and vertically balanced across all form fields and data tables.

2. **Arabic Text Search Normalization:**
   - Any query searching students or teachers by name must pass through the `normalizeArabicText` / `normalize_arabic` utility.
   - Unify Alef variations (`أ`, `إ`, `آ` -> `ا`), normalize Taa Marbouta (`ة` -> `ه`), normalize Alef Maksoura (`ى` -> `ي`), and strip diacritics/tashkeel (`[\u064B-\u065F\u0670]`).
   - Never perform case-sensitive or exact Hamza comparisons on student names during door check-ins.

3. **Financial Arithmetic Isolation in the Domain Service Layer:**
   - Frontend components and API controllers must **NEVER** calculate teacher payouts, center splits, or drawer expected balances.
   - All financial formulas reside strictly in backend domain logic (exported pure functions in the route modules, e.g. `calculateSessionSettlement`, `computeShiftFinancialSummary`, `calculateCashVariance`).
   - Invariant:
     $$\text{Teacher Payout} = \text{Reconciled Headcount} \times (\text{Session Price} - \text{Center Fee per Student})$$
     $$\text{Expected Cash in Drawer} = \text{Opening Cash} + \text{Cash Collected} - \text{Teacher Cash Payouts} - \text{Cash Expenses}$$

4. **Strict Concurrency & Duplicate Check-In Prevention:**
   - Check-in mutations must be wrapped in database ACID transactions (`prisma.$transaction`).
   - Rely on the database constraint `UNIQUE (session_id, student_id)`. Handle PostgreSQL code `23505` gracefully by returning HTTP `409 Conflict` with `DUPLICATE_CHECK_IN`.
   - Broadcast check-in and void events over WebSocket immediately after transaction commit, into the room returned by `lobbyRoomFor(tenantId)` in `src/server/lib/socket.ts`.
   - Lobby rooms are **tenant-isolated**. A center's staff must only ever join `tenant:<id>:lobby`; the shared `center:lobby` room is reserved for users who belong to no single center (super admin). Never emit a tenant's event to `center:lobby`, and never spell a room name out as a literal — a duplicated room string is how this leak originally happened.

5. **Historical Financial Immutability:**
   - Once a session is `COMPLETED`, its settlement record is permanently locked.
   - Once a shift register is `CLOSED`, no new attendances, expenses, or payouts may be attached to it.
   - Any attempt to modify closed financial entities must throw an immediate domain error.

---

## 2. Directory Structure & File Placement

- **Frontend:** `src/client/`
  - `locales/ar/`: Arabic JSON translation modules (`common.json`, `lobby.json`, `settlement.json`, etc.).
  - `locales/en/`: English translation mirrors.
  - `features/`: Domain feature slices — `navigation/` (menu items), `management/` (rooms + rooms/teachers CRUD), `scheduling/` (sessions), `students/` (registry + quick-add), `operations/` (lobby, shift, reconciliation, settlement, reports).
  - `components/layout/`: AppShell, Header (language switcher), Sidebar, DeskStationBadge, StatusAlerts.
  - `components/ui/`: Accessible RTL primitives (AsyncState, popovers, etc.).
  - `auth/`: AuthContext + LoginPage.
- **Backend:** `src/server/`
  - Route-first modular design: `src/server/app.ts` registers Fastify plugins under `/api/*` prefixes.
  - `modules/`: One route file per feature (`auth.ts`, `rooms.ts`, `teachers.ts`, `sessions.ts`, `students.ts`, `shifts.ts`, `attendances.ts`, `reconciliations.ts`, `settlements.ts`, `reports.ts`) plus domain pure functions exported for tests.
  - `lib/`: Cross-cutting concerns — `security.ts` (auth guards, cookies, rate limiters, CSRF), `socket.ts` (Socket.io), `http.ts` (UUID/money validation, pagination), `prisma.ts` (Prisma client).
  - No `middleware/` directory; auth/RBAC/error handling are plugins and `preHandler`s.
- **Shared Contracts:** `src/shared/`
  - `types/`: Shared TypeScript models (roles, payment methods, etc.).
  - `constants/`: Shared constants.
  - `utils/arabicNormalization.ts`: Single source of truth for text normalization.
  - Server-side validation uses **Fastify JSON Schema** (defined inline in each route module), not Zod. Client uses manual inline validation.

---

## 3. Egyptian Domain Standards

- **Mobile Phone Numbers:**
  - Must validate against Egyptian mobile format: `^(010|011|012|015)[0-9]{8}$`.
- **Currency & Formatting:**
  - Currency unit is **Egyptian Pound (EGP / ج.م)**.
  - Amounts must be stored as decimals with 2 fractional digits.
  - Display formatted via `Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' })`.
- **Payment Methods:**
  - Strictly limited to: `'CASH'`, `'VODAFONE_CASH'`, `'INSTAPAY'`.

---

## 4. Testing Requirements

- **Unit Tests:** All financial calculations (split math, cash drawer expected balance) must have 100% unit test coverage.
- **Arabic Normalization Tests:** Verify that names with varied spellings (e.g. "أحمد", "إحمد", "احمد") produce identical normalized strings.
- **Concurrency Integration Tests:** Verify that simultaneous check-in attempts for the same student in the same session safely produce exactly 1 success and 1+ `409 Conflict`.
- **Lifecycle Integration Tests:** Verify the subscription guard against real `Subscription` rows — no subscription and a rejected (`CANCELED`) payment are read-only, an expired center keeps writing through the whole grace window, a past-grace center gets `403 TENANT_FROZEN` on writes while reads still succeed, and paying again restores writes. A token with no `tenantId` must get `403 TENANT_CONTEXT_MISSING`.

### Running the DB-backed suite

`tests/integration/db/*` is **destructive** — it empties every business table on each run. It is skipped unless `TEST_DATABASE_URL` is set, and it refuses to start if that database's name does not contain `test` or if it points at the same database as `DATABASE_URL` (the app's own `.env` points at a live Supabase development instance).

```powershell
npm run db:start          # local PostgreSQL, if not already running
npm run test:db:setup     # create edu_center_erp_test + apply migrations
$env:TEST_DATABASE_URL = 'postgresql://postgres:postgrespassword@127.0.0.1:5432/edu_center_erp_test?schema=public'
npm run test:integration
```

`npm run test:db:reset` drops and recreates the test database. `scripts/test-db.ps1 url` prints the connection string, so it never has to be typed by hand and drift is impossible.

### Before taking a real client

- `NODE_ENV=production` **must** be set. With anything else, the required-variable check is skipped and the process generates throwaway signing secrets (safe from forgery, but every session dies on restart).
- `JWT_SECRET` and `COOKIE_SECRET` must be strong random values, not generated. There is no hardcoded fallback secret in the source, and `tests/production-safety.test.ts` enforces that.
- `SUPER_ADMIN_USERNAME` / `SUPER_ADMIN_PASSWORD` must be set on the first boot, or no platform admin exists and no center can ever be approved.
- Demo seeding is disabled in production. It must stay that way: the demo center's passwords are public defaults, and usernames are globally unique, so a seeder that upserts by username can silently reset a real client's password and move their account. `tests/production-safety.test.ts` and `tests/integration/db/demo-seed.test.ts` pin this.
- A database backup must exist **and be known to restore** before storing real student records. The Railway cron service runs one daily on its own; see below. Confirm its last run succeeded, and that the stored dump is restorable, before onboarding a client. Railway's own Postgres automated backups are the layer underneath it; both are needed.

## Backups

`scripts/backup-db.ps1` takes a logical dump of the `public` schema via `pg_dump`, and restores it anywhere. It reads `DATABASE_URL` from `.env` unless told otherwise.

```powershell
npm run db:backup        # dump whatever .env points at into backups/, keep the newest 14
npm run db:backups:list  # what exists, and when
npm run db:restore       # restore the newest dump (destructive; needs -Confirm)
```

Rules the script enforces, and why they exist:

- **Never hand-type the URL.** It is always `.env`'s, so a backup cannot silently hit the wrong database.
- **Restore needs `-Confirm`, and needs `-AllowLive` as well** when the target is the `.env` database. The guards run before any network access.
- **Only the `public` schema is dumped by default.** A whole-database dump carries provider-internal schemas (`auth`, `storage`, `vault`) and extensions like `supabase_vault` that exist nowhere else, so it restores into that same provider and nowhere else. `-AllSchemas` opts back in.
- **The password goes through `PGPASSWORD`, never the command line**, so it is not visible in the process list.
- **Port 6543 is rejected**: that is Supabase's transaction pooler, which `pg_dump` cannot use. `DATABASE_URL` must be the session pooler or direct connection.
- **Extensions are captured beside the dump** in `*.extensions.sql`. The dump references `public.gin_trgm_ops` without creating the extension, so a restore that skipped this fails on the first index.
- **Restore runs in passes** — schema, then extensions, then data, then indexes — because the dump creates `public` itself, the extensions must already be in `public` for the index pass, and `public` cannot exist before the schema pass. It finishes by asserting the target actually has tables, because a restore that quietly creates nothing is worse than one that fails.

Local `.env` points at the Supabase development database. **Production runs on Railway Postgres**, and the daily job below is the one that covers it. `backups/` is gitignored because a dump contains real student and payment records.

## The unattended backup

The PowerShell script above needs a human to run it. Someone who will not open a terminal every day needs the dump to happen on its own, so the same guarantees are implemented a second time in `scripts/backup/`, running on a Railway cron service.

- `scripts/backup/backupCore.mjs` — the rules, as pure functions: URL parsing, `pg_dump` arguments, extension selection, retention, freshness, AWS SigV4 signing, list-response parsing, secret redaction.
- `scripts/backup/runBackup.mjs` — the job. Dumps, uploads to S3-compatible storage, prunes, checks its own freshness, exits non-zero on any failure.
- `Dockerfile.backup` — `node:22-bookworm-slim` plus `postgresql-client-18`, and nothing else. No `npm ci`, because a change to application code must not be able to break the backup. That is also why the S3 client is hand-written against `node:crypto` rather than `@aws-sdk/client-s3`.
- `npm run db:backup:remote` / `db:backups:remote:list` — the same job by hand.

The production database is **Railway Postgres**, and the dumps go to a Railway **object storage** bucket. `DATABASE_URL` is set to `${{er.DATABASE_URL}}` so the job always dumps exactly the database the app uses, and cannot drift onto another one if the connection string changes.

| Variable | Meaning |
| --- | --- |
| `DATABASE_URL` | `${{er.DATABASE_URL}}`. A direct or private-network connection; port 6543 is refused. |
| `BACKUP_S3_ENDPOINT` | The endpoint from the bucket's page. Must be `https`; the bucket name is prefixed onto the host unless the endpoint is already bucket-scoped. |
| `BACKUP_S3_REGION` | The region from the bucket's page. This is the value most often wrong, and a wrong one produces `SignatureDoesNotMatch` — the error message says so. |
| `BACKUP_S3_ACCESS_KEY_ID` | Never logged; every message is scrubbed before printing. |
| `BACKUP_S3_SECRET_ACCESS_KEY` | The only real secret. Never logged, never committed, never pasted into chat. |
| `BACKUP_S3_BUCKET` | Defaults to `erp-backups`. |
| `BACKUP_S3_PATH_STYLE` | Optional `true`/`false` override. Normally detected from the endpoint. |
| `BACKUP_KEEP` | Dumps to keep, newest first. Default 14. Must be at least 1. |
| `BACKUP_MAX_AGE_HOURS` | A run fails if the newest stored dump is older than this. Default 48, so one missed day still passes. |

Why each rule exists, given nobody is watching the output:

- **A dump under 1 KB is a failure, not a small success.** An empty database is legitimately small, but so is a dump that failed in a way that still exits zero. Storing it would look like a healthy backup for weeks.
- **The uploaded object is read back with a `HEAD`, and its length compared.** A `PUT` that returns 200 is not proof the bytes arrived; a dump that stored truncated would restore into a broken database and look fine until someone needed it.
- **Freshness is asserted every run.** A job that stopped working silently is worse than one that never worked, because it looks fine. The check fails the run, which fails the Railway deployment, which is what sends the email.
- **Retention can never empty the bucket.** A `BACKUP_KEEP` below 1 is refused rather than treated as "keep nothing", and the newest dump is never a deletion candidate. Sidecars travel with their dump, and a sidecar whose dump is gone is cleaned up.
- **A truncated listing is followed to the end.** A paginated `ListObjectsV2` response that stops at the first page would hide old dumps, so they would never be pruned and the freshness check would pass on a partial view.
- **`pg_dump` must be at least as new as the server.** An older client refuses to connect, so the version is compared on every run and reported. This is why the image pins client 18: production is Railway Postgres, running the server image `postgres-ssl:18`. Upgrading that service without bumping this pin would silently stop every dump, so `tests/backup-remote.test.ts` pins the two together.
- **The temporary copy is deleted in a `finally`.** The dump is real student and payment data; it must not survive on the runner's disk.
- **The bucket is private and the endpoint must be `https`.** There is no code path that creates a public bucket, and an `http` endpoint is rejected before any credential is read.

Restoring from storage is deliberately manual: download the dump and its `.extensions.sql` from the bucket's page in Railway, then `npm run db:restore -OutputDir <dir>`. An unattended restore is an unattended way to lose data to a bad cron run.

**Storage and the database are both on Railway.** This is the weakest point in the design and it is a deliberate, recorded trade-off: a Railway account-level problem, or a project deletion, takes the database and the backups together. It still covers the realistic failures — a bad migration, a dropped table, corruption, an accidentally wiped database — and Railway's own Postgres automated backups remain the layer underneath. A copy on a separate provider is the only thing that closes this gap.

The one manual step is adding the four `BACKUP_S3_*` values from the bucket page to the backup service in the Railway dashboard. They are never pasted into chat, never committed, and never logged.
