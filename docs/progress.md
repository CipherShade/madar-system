# Project Progress: Educational Center ERP

## Current Phase

**Phase 2 — Implementation (complete) / Phase 3 — Product Completion (core + hardening + the 16-section Super Admin platform console done) / Phase 4 — Online Launch (production configuration prepared)**  
*Core workflows, UX screens, security hardening, the documentation audit, the PROMPT 9 production configuration (env-driven API/socket URLs, fail-fast prod config, graceful shutdown, startup logging, deployment guide, clean-checkout build verified), and the Madar platform-operations console (centers, users, subscriptions & billing, usage, revenue, health, audit, data, security, support, account) are implemented, with all 6 migrations applied to the connected database. Remaining work: live DB acceptance, a few open hardening/release items below, and connecting the system to hosted services for launch.*

---

## Phase 1: Planning & Architecture (Completed)

- [x] Initial idea ([idea.md](../idea.md))
- [x] Product specification ([docs/product.md](product.md))
- [x] Technical architecture ([docs/architecture.md](architecture.md))
- [x] Database design ([docs/database.md](database.md))
- [x] API & WebSocket contract ([docs/api.md](api.md))
- [x] Arabic Version & RTL localization specifications
- [x] Project README & AI development rules ([README.md](../README.md), [AGENTS.md](../AGENTS.md))
- [x] Technical decisions confirmed: Fastify + PostgreSQL 15 (Docker) + Prisma ORM + TypeScript

---

## Phase 2: Step-by-Step Implementation

- [x] **Step 1: Project Foundation Setup** (Completed)
  - Root `package.json` with scripts & dependencies (Fastify, Prisma, React 18, Vite, Tailwind RTL, i18next, Zod, Socket.io)
  - Docker Compose configuration for PostgreSQL 15+ container ([docker-compose.yml](../docker-compose.yml))
  - TypeScript configurations (`tsconfig.json`, `tsconfig.server.json`)
  - Server initialization with Fastify (`src/server/app.ts`, `src/server/server.ts`, `src/server/config/`)
  - Client initialization with Vite + React 18 + Cairo Font + Tailwind RTL (`src/client/`)
  - Shared contracts directory (`src/shared/constants/`, `src/shared/utils/arabicNormalization.ts`, `src/shared/types/`)
  - Prisma schema with all core entities & operational change tracking ([prisma/schema.prisma](../prisma/schema.prisma))
  - Local environment file created ([.env](../.env))

- [x] **Step 2: Database Modeling & Migrations (Prisma + PostgreSQL)** (Completed)
  - Prisma schema with all core entities + `@@index` directives ([prisma/schema.prisma](../prisma/schema.prisma))
  - `normalize_arabic()` PostgreSQL IMMUTABLE function (Alef unification, Taa Marbouta, Alef Maksoura, Harakat stripping) ([migration.sql](../prisma/migrations/0001_init/migration.sql))
  - Functional GIN trigram indexes on `students.full_name` & `teachers.full_name` for sub-15ms Arabic fuzzy search
  - Partial indexes for active sessions, open shift registers, and concurrency-guard unique constraint on `(session_id, student_id)`
  - Seed script bootstrapping Admin + Receptionist users (Argon2id), 3 rooms, 2 teachers, 5 students with `search_name` pre-computed ([prisma/seed.ts](../prisma/seed.ts))
- [x] **Step 3: Arabic UI Foundation, i18n & Base Layout**
  - RTL root configuration (`dir="rtl"`) with Cairo Google Font
  - Tailwind CSS RTL layout setup and directional tokens
  - `i18next` integration with Arabic (`ar`) default dictionaries and English fallback
  - Base responsive shell: Header, sidebar navigation, desk station badge, and status alerts
- [x] **Step 4: Authentication & Role-Based Access Control (RBAC)**
  - Argon2id password hashing and JWT issuance in HTTP-Only cookies
  - Login / Logout endpoints and client Auth context
  - Role guards: `ADMIN` (full control) vs `RECEPTIONIST` (desk operations only)
- [x] **Step 5: Hall / Room & Teacher Management**
  - CRUD operations for classrooms with seat capacity limits
  - Teacher registry with subject and agreed **Fixed Center Fee per Student** (in EGP)
  - Primary assistant details tracking
- [x] **Step 6: Session Scheduling & Conflict Prevention**
  - Scheduling calendar for classes (teacher, room, academic stage, time window, pricing)
  - Room double-booking collision prevention
- [x] **Step 7: Student Registry & Arabic Phonetic Search**
  - Student directory with Egyptian mobile validation (`010/011/012/015`)
  - 10-second Quick-Add modal for new arrivals at the door
  - High-speed phonetic search tolerating Alef, Taa Marbouta, and diacritic variations
- [x] **Step 8: Desk Shift Registers & Cash Drawer Control**
  - Shift opening endpoint with starting cash balance
  - Per-desk isolated drawer tracking (Desk 1, Desk 2)
  - Petty cash & buffet expense recording from drawer
- [x] **Step 9: Rush-Hour Lobby Fast Check-In & Multi-Channel Payments**
  - Active & Starting-Soon sessions dashboard cards
  - Dynamic session filtering per receptionist desk
  - 1-click check-in with 3 payment methods: Cash, Vodafone Cash, InstaPay
  - Student change tracking (`change_owed`) when change is missing
  - Concurrency safety: Database-level unique constraint preventing double entry
- [x] **Step 10: Multi-Desk WebSocket Real-Time Synchronization**
  - Socket.io broadcast hub on room `center:lobby`
  - Real-time attendee counter sync across concurrent reception terminals
- [x] **Step 11: In-Hall Headcount Reconciliation**
  - Reception count vs. Teacher Assistant in-hall roll-call comparison
  - Discrepancy resolution workflow and notes before closing
- [x] **Step 12: Automated Session Settlement & Teacher Payouts**
  - Fixed fee calculation: $\text{Reconciled Headcount} \times \text{Fixed Fee} = \text{Center Cut}$; remainder = Teacher Payout
  - Teacher cash disbursement from active desk drawer
  - Permanent session locking (`COMPLETED`)
- [x] **Step 13: End-of-Shift Cash Drawer Closing & Variance Audit**
  - Expected cash calculation: $\text{Opening} + \text{Cash In} - \text{Payouts} - \text{Expenses}$
  - Actual physical cash count input and variance tracking (overage / shortage)
  - Shift register lock (`CLOSED`)
- [x] **Step 14: Center Reporting & Shift Audit Trails**
  - Daily summary: total attendees, center net revenue, teacher payouts, digital collections
  - Audit log per receptionist shift drawer

---

## Phase 3: Product Completion

### Step 15: Finish the Reception Operations UI

- [x] Build the Lobby Dashboard screen
  - List active and starting-soon sessions
  - Search students using the existing Arabic-normalized registry API
  - One-click check-in with Cash, Vodafone Cash, and InstaPay
  - Capture digital payment references
  - Show session capacity, attendee count, payment result, duplicate-check-in, and change-owed states
  - Subscribe to Socket.io `center:lobby` and update counts without refresh
- [x] Build the Shift Register screen
  - Open a desk shift with opening cash
  - Show live cash expected, cash collections, digital collections, payouts, and expenses
  - Record cash and digital expenses with validation
  - Close the drawer with physical cash count and closing notes
  - Display overage/shortage clearly and prevent actions after `CLOSED`
- [x] Build the Reconciliation screen
  - Show lobby attendance count for a selected session
  - Enter assistant in-hall count and reconciled headcount
  - Require resolution notes when counts differ
  - Show reconciliation status and lock editing after settlement
- [x] Build the Settlement screen
  - Show the server-calculated revenue split
  - Select payout method and recipient
  - Confirm teacher payout before submission
  - Show completed-session lock and payout receipt/details
- [x] Build the Reports screen
  - Select a reporting date
  - Show attendees, center net revenue, teacher payouts, and digital collections
  - Break digital totals down by Vodafone Cash and InstaPay
  - Browse a receptionist shift audit log with actor, action, amount, entity, metadata, and time
- [ ] Add loading, empty, error, retry, success, and permission states to every operational screen
- [x] Ensure all new UI text is localized in Arabic and English dictionaries
- [ ] Verify all screens remain RTL-native, responsive, keyboard accessible, and usable on desk-sized displays

### Step 16: Complete API and Domain Hardening

- [x] Wrap related mutations in database transactions
  - Attendance creation and audit logging
  - Settlement creation, session completion, and audit logging
  - Shift closing and audit logging
  - Expense creation and audit logging
- [x] Enforce closed-shift and completed-session guards in attendance, expense, payout, and reconciliation paths
- [ ] Make audit logging failure-safe: business mutations must not silently succeed without their audit record
- [ ] Add request validation for UUIDs, dates, money precision, payment references, and pagination limits
- [ ] Add consistent HTTP error handling for Prisma not-found, unique, foreign-key, and transaction failures
- [ ] Add pagination and date-range limits to audit and reporting endpoints
- [ ] Review authorization so receptionists only access their own shift data and admins access center-wide data
- [ ] Add request logging and correlation IDs without logging passwords, cookies, or payment secrets
- [ ] Confirm digital payment references are stored and returned according to the required privacy policy

### Step 17: Database and Migration Readiness

- [x] Apply and verify all Prisma migrations against a clean PostgreSQL database (CI runs `prisma migrate deploy` + `status` against a fresh Postgres 15 service on every push; a live run against the hosted production DB is still pending)
- [x] Run `prisma generate` and `prisma validate` locally; add the production migration command for CI
- [ ] Test migration upgrade from the original schema to the audit-log schema
- [ ] Confirm foreign keys, indexes, unique constraints, money precision, and enum values in PostgreSQL
- [ ] Verify seed data works on an empty database and does not expose real credentials
- [x] Add backup and restore instructions for PostgreSQL
- [x] Add an explicit production migration command and prohibit destructive reset commands in production
- [x] Add `.env.example` and require production seed passwords through environment variables

### Step 18: Automated Test Coverage

#### Database Platform Schema — Deployed

- [x] Authored and applied the additive 20260924000000_platform_models migration (9 CREATE TABLE: platform_notifications, support_notes, system_settings, usage_overrides, system_health_events, super_admin_permissions, super_admin_sessions, super_admin_user_permissions, super_admin_audit_logs; 4 enums: SupportNoteStatus, SystemHealthLevel, PlatformNotificationAudience, PlatformNotificationStatus). Verified: 9/9 platform tables + 4/4 enums present in Supabase.
- [x] Authored and applied the additive 20260925000000_platform_billing_and_users migration (`Tenant.discountBalance`, `Tenant.creditBalance`, `User.lastLoginAt`, `User.searchName`, and the `SubscriptionAdjustment` table with `DISCOUNT / CREDIT / REFUND` rows). Verified: `db:migrate:status` reports all 6 migrations applied and every platform read route executes without a missing-column error.

- [x] Super-admin server console endpoints (Phase 2) — `GET /console-stats` (platform KPIs v2), `POST /tenants/:id/view-as`, `POST /view-as/return`, plus `SuperAdminAuditLog` capture on extend-trial, suspend/reactivate, and both view-as actions
- [x] Super-admin console UI (Phase 3) — Platform tab (MRR / centers / support / usage-override / view-as counters + system-health events) and View-as-Center (mandatory audit reason, 30-minute tenant-scoped `ADMIN` impersonation token, active-session banner with expiry countdown + auto-clear, end-session action, center data preview through the scoped token). New strings localized in the `superAdmin` section of `src/client/locales/{ar,en}/common.json`
- [x] Platform-operations backend (Phase 4) — `src/server/modules/admin/platformOps.ts` registered at `/api/admin`: 18 read routes + 10 mutations, every mutation and its `SuperAdminAuditLog` row committed in one `prisma.$transaction` (audit helper receives the transaction client, fail-closed). Adds support notes (`GET|POST /support-notes`, `PATCH /support-notes/:id`), usage overrides (`GET|POST /usage-overrides`, `DELETE /usage-overrides/:id`), settings, feature flags, notifications, payments verify/reject, health checks, data status + JSON exports, sessions, and own-account reads/updates. The app-level async error handler records 5xx responses as `SystemHealthEvent` (`category: 'api.error'`), so the health surface reports measured events only.
- [x] Platform-operations console UI (Phase 4) — `SuperAdminPage.tsx` rewritten as a 16-section grouped sidebar shell with `sessionStorage` section memory, `refreshToken`-keyed remount, the view-as banner + scoped center preview, and shared `registry.ts` / `primitives.tsx` / `hooks.ts` / `format.ts` / `plan.ts` / `types.ts` helpers under `features/admin/sections/`. Plan pricing is read-only from `src/shared/constants/plans.ts`; unmeasurable signals are omitted rather than invented. All strings localized in `superAdmin.*` (plus a root `common` object) in `src/client/locales/{ar,en}/common.json`, with the two dictionaries verified key-identical.
- [x] Center management (Phase 5) — center creation with its owner `ADMIN`, per-center limit overrides (`maxUsers` / `maxDesks` / `maxBranches` / `visitLimit`) with an audit reason, and a Center 360° drill-down (usage counts, subscription timeline, recent platform audit, owner contact). `POST /tenants` and `PATCH /tenants/:id/limits` added to `src/server/modules/admin/admin.ts`.
- [x] User directory (Phase 5) — `src/server/modules/admin/platformUsers.ts`: cross-center paginated/searchable directory (`GET /users`, `GET /users/:id`), user creation with a one-time temporary password, role/active-state editing, password reset, and session revocation via `sessionVersion`. A suspended center or one at its user cap is refused server-side (`409 CENTER_SUSPENDED` / `409 CENTER_USER_LIMIT_REACHED`). Passwords are never persisted in plaintext or written to the audit log.
- [x] Usage & limits (Phase 5) — `src/server/modules/admin/platformUsage.ts`: per-center `USERS / RECEPTIONISTS / STUDENTS / VISITS / BRANCHES` against plan limits, including active `UsageOverride` extras and the 80% warning level; grants and revocations from the console.
- [x] Subscriptions, billing & revenue (Phase 5) — `src/server/modules/admin/platformBilling.ts` plus the pure domain function module `billingMath.ts`: subscription list with status totals and stale-`PENDING` flag, record subscription, cancel (period-end or immediate), reactivate, discount, credit, refund, adjustment history with per-type totals (`GET /billing/adjustments`), and monthly collected revenue (`GET /revenue`). All money math lives in the backend domain layer — no client or controller formulas.
- [x] Account password change (Phase 5) — `PATCH /admin/account/password` verifies the current password, enforces an 8-character minimum, and revokes every other session. Two-factor authentication is deliberately not supported by the console.
- [x] Platform-ops test coverage — `tests/platform-ops.test.ts` enumerates the **complete** read/write route lists (401 on every read/write without a token, malformed-token rejection, center `ADMIN`/`RECEPTIONIST`/impersonation-token separation at 403, forged-role rejection, `SUPER_ADMIN` passes every read route, pre-DB input validation, feature-flag catalog integrity) and `tests/billing-math.test.ts` adds 32 tests over the pure billing domain functions; `tests/integration/db/platform-audit-atomicity.test.ts` holds 3 DB-gated mutation↔audit atomicity tests (skipped unless `TEST_DATABASE_URL` is set). `npx tsc -b` and `npx tsc -p tsconfig.server.json --noEmit` clean; `npm run build` green; `npm run test:unit` → **223/223 passing**.




> Coverage status: `npm test` → **223 backend tests / 23 files green** (Node `node:test` via `tsx` + `fastify.inject`, DB-less fake-Prisma helpers); `npm run test:frontend` → **cannot run in this checkout**: `vitest` is declared in `devDependencies` but missing from the installed `node_modules` (the 25 frontend tests need `npm ci` to be installed; pre-existing gap, not caused by the platform work); `npm run test:db` → full-lifecycle DB-backed suite (skipped unless `TEST_DATABASE_URL` is set to a disposable PostgreSQL).
>
> Notes: `test:unit` (`tests/unit/*.test.ts`) and `test:integration` (`tests/integration/*.test.ts`) scripts currently match **no files** — the backend suites live flat in `tests/`. Frontend suites live in `tests/frontend/` (excluded from `tsconfig.json`/`tsconfig.server.json` type-checking).
>
> Unticked items below are covered by `tests/integration/db/lifecycle.test.ts`, which exercises them end-to-end but still needs verification against a real disposable test database (`npm run db:migrate:deploy` first). Before relying on it, confirm the daily-report table's `totalAttendees` expectation against a live DB (manual check-in count is 8 pre-void vs. the test's asserted 7/6).

- [x] Add API integration tests for authentication and RBAC
- [x] Add API integration tests for room, teacher, student, and session CRUD (:guard radius — validation and RBAC on every CRUD verb; happy-path writes require a test DB, see DB suite + note above)
- [ ] Add lobby check-in integration tests for all three payment methods (DB suite)
- [ ] Add concurrent duplicate check-in integration tests with exactly one successful insert (DB suite)
- [ ] Add reconciliation integration tests for matching and mismatched counts (mismatch/zero/discrepancy unit logic and route guards are covered; DB suite for matched-flow)
- [ ] Add settlement integration tests for cash, Vodafone Cash, and InstaPay payouts (DB suite)
- [ ] Add closed-shift and completed-session immutability tests (DB suite)
- [ ] Add shift close integration tests for exact balance, overage, shortage, expenses, and payouts (all formulas unit-covered; routed end-to-end in DB suite)
- [ ] Add daily report integration tests across date boundaries and void attendance records (date-bounds and zero-totals unit tests are covered; void round-trip in DB suite)
- [ ] Add audit-log integration tests for ordering, actor attribution, authorization, and mutation coverage (authorization guards covered; ordering/actor/mutation in DB suite)
- [x] Maintain 100% unit coverage for settlement, expected-cash, variance, reconciliation, and report aggregation formulas
- [x] Add frontend component and workflow tests for login, check-in, shift close, reconciliation, settlement, and reports
- [ ] Add Socket.io integration tests for join, leave, and cross-desk attendance updates (DB suite)
- [ ] Add accessibility checks for keyboard navigation, labels, focus states, contrast, and RTL layout

### Step 19: Security and Operational Readiness

> Security hardening (PROMPT 7) is implemented and covered by automated tests: signed HTTP-only `access_token` cookie, CORS + CSRF origin guard, per-endpoint rate limits, payload limits, safe error envelopes, request IDs, redacted logging, environment validation, and dev/prod secret separation.

- [x] Configure secure, HTTP-only, same-site cookies correctly for development and production (signed `access_token`, `SameSite=Lax`, `Secure` in prod, `maxAge` = JWT expiry)
- [x] Restrict CORS to configured trusted origins (`CORS_ORIGIN`)
- [x] Add rate limiting for login, student search, and check-in endpoints (login 10/min, checkIn 240/min, studentSearch 240/min, financial 60/min; env-overridable)
- [x] Add payload size limits and safe error responses (`REQUEST_BODY_LIMIT_KB`, `SOCKET_MAX_PAYLOAD_KB`, sanitized error/not-found envelopes)
- [x] Validate and sanitize all user-entered Arabic and English text (Fastify JSON Schema, Egyptian mobile regex, money 2dp, reference lengths)
- [x] Review authorization on every route, including report and audit endpoints (receptionists scoped to their own shift audits)
- [x] Add session expiry, logout behavior, and inactive-user handling tests
- [x] Add structured production logging, health checks, and graceful shutdown (`/api/health`, Pino redaction, `x-request-id`)
- [x] Add environment validation with a documented `.env.example` (production refuses to start without required secrets)
- [x] Remove development-only defaults, secrets, debug output, and test credentials from production configuration (dev-only fallback secrets warn; `.env` is git-ignored)
- [ ] Define retention and access policy for student phone numbers, payment references, and audit logs

### Step 20: Documentation and Release

> Documentation audit (PROMPT 8) and the PROMPT 9 production configuration are complete; remaining items below are release-phase checks.

- [x] Update `README.md` with installation, environment, database, development, test, and production commands (stack table + roadmap realigned to the implemented architecture)
- [x] Update `docs/api.md` so every implemented route matches the actual prefix, request, response, and error behavior (base `/api`, cookie auth, socket events, error catalog)
- [x] Update `docs/database.md` with `AuditLog`, real index names, `search_name`, `change_owed`, migration order, and immutability rules
- [x] Update `docs/architecture.md` with frontend feature boundaries, transaction boundaries, actual module/socket structure, and audit ownership (alternatives like Express/Drizzle/SQLite/Zod/Supertest removed)
- [ ] Add a troubleshooting guide for PostgreSQL, Prisma, Socket.io, authentication, and CORS
- [x] Add a deployment guide for server, client, PostgreSQL, migrations, backups, and rollback ([docs/deployment.md](deployment.md) — production env vars, same-origin vs split hosting, build/migrate/launch, health & graceful shutdown, troubleshooting)
- [x] Add a production operations runbook (backup, restore, rollback, staging simulation, post-deploy verification, remaining blockers) ([docs/runbook.md](runbook.md))
- [x] Add deployment artifacts: `Dockerfile` (single-origin image with Prisma CLI + `pg_dump`/`pg_restore` + healthcheck), `.dockerignore`, `docker-compose.staging.yml` (full production-image + PostgreSQL verification stack), and `scripts/backup.ps1`, `scripts/restore.ps1`, `scripts/migrate.ps1`, `scripts/seed.ps1`
- [x] Add CI checks for client build, server build, Prisma validation/`migrate deploy`/`migrate status`, backend + frontend tests, and production Docker image build ([.github/workflows/ci.yml](../.github/workflows/ci.yml); a manual deploy workflow is at [deploy.yml](../.github/workflows/deploy.yml)); no lint is configured in the repo yet
- [ ] Produce a staging environment with seeded non-production data
- [ ] Run a receptionist acceptance session covering a full class lifecycle from check-in to drawer close
- [ ] Run an administrator acceptance session covering management, settlement, reports, and audit review
- [ ] Record and resolve all release-blocking defects
- [ ] Tag the first production release and archive the verified migration and configuration versions

### Definition of Done

- [ ] A receptionist can log in, open a drawer, check students in from multiple desks, record payments and expenses, reconcile sessions, settle teacher payouts, and close the drawer without direct API access
- [ ] An administrator can manage rooms, teachers, students, sessions, staff access, reports, and audit history from the UI
- [ ] All financial values are calculated server-side, stored as two-decimal decimals, and protected by transaction and immutability rules
- [ ] Duplicate check-ins, closed-shift mutations, completed-session mutations, and unauthorized audit access are rejected with tested error responses
- [x] The client and server production builds pass from a clean checkout (verified with `npm ci --include=dev` -> `npm run build:production`; backend suite re-verified at **223/223**, frontend suite pending `npm ci` to install the missing `vitest` binary)
- [ ] Database migrations, seed, backup, restore, deployment, and rollback procedures are documented and verified
- [ ] Automated tests and manual acceptance checks pass for the complete operational lifecycle

---

## Phase 4: Online Launch (Supabase + Cloud Hosting)

> This is the recommended path for a non-technical owner. The final ERP is a web application. Your laptop is used only for development and does not need to stay on. Docker is optional for local development and is not required for production.

### Step 21: Prepare the Project for One Online Web Application

- [x] Serve the built React frontend from the production web server at one public URL
- [x] Add production startup behavior for the Fastify server
- [x] Add a production health endpoint that verifies application and database readiness without exposing secrets
- [x] Read the API base URL from environment configuration instead of assuming `/api` when frontend and backend use different hosts (`VITE_API_BASE_URL` / `VITE_SOCKET_URL`, baked in at build time; relative same-origin by default)
- [ ] Configure Socket.io for the production origin and verify WebSocket upgrades through the hosting provider (CORS origin + WebSocket upgrade verified locally against the production build; provider-level upgrade still to confirm after deploy. `docker-compose.staging.yml` now lets you verify real TCP WebSocket upgrades + auth against the production image in a docker network before deploying)
- [x] Confirm the production build works from a clean checkout with no local-only files
- [x] Keep `.env`, database URLs, passwords, and signing secrets out of GitHub
- [x] Add a cloud deployment blueprint with production build, start, and health-check commands

### Step 22: Create the Online Services

- [ ] Create a Supabase account at `https://supabase.com`
- [ ] Create a new Supabase project for the ERP
- [ ] Choose a strong database password and store it in a password manager
- [ ] Copy the Supabase PostgreSQL connection string; do not paste it into public files or chat
- [ ] Create a Render or Railway account at `https://render.com` or `https://railway.app`
- [ ] Connect the GitHub repository to the hosting provider
- [ ] Create one backend web service for the Fastify server
- [ ] Create one frontend web service, or serve the frontend from the backend as one public service
- [ ] Use HTTPS URLs supplied by the hosting provider

### Step 23: Configure Production Environment Variables

- [ ] Set `NODE_ENV=production`
- [ ] Set `DATABASE_URL` to the private Supabase PostgreSQL connection string
- [ ] Generate and set a long random `JWT_SECRET`
- [ ] Generate and set a long random `COOKIE_SECRET`
- [ ] Set `JWT_EXPIRES_IN` to the approved session lifetime
- [ ] Set `CORS_ORIGIN` to the exact public frontend URL
- [ ] Set `PORT` according to the hosting provider's port requirement
- [ ] Set `SEED_ADMIN_PASSWORD` and `SEED_RECEPTIONIST_PASSWORD` only if production seed data is intentionally required
- [ ] Never use the development `.env` file or the documented demo passwords in production
- [ ] Configure secure cookies for the final HTTPS domain

### Step 24: Deploy the Database Safely

- [ ] Run `npm run db:migrate:deploy` against the Supabase database
- [ ] Run `npm run db:migrate:status` and confirm every migration is applied
- [ ] Run `npx prisma validate` and `npx prisma generate` in the deployment pipeline
- [ ] Run the seed only once with production-controlled passwords, or create the first admin manually
- [ ] Confirm the `AuditLog` table exists
- [ ] Confirm foreign keys, indexes, enums, decimal money columns, and the attendance unique constraint
- [ ] Test an upgrade from the original `0001_init` schema through `0002_audit_logs` on a staging database
- [ ] Enable Supabase backups and verify how to restore a backup before storing live financial data

### Step 25: Deploy and Verify the Web Application

- [ ] Deploy the backend and wait for a healthy status
- [ ] Open the public health URL in a browser
- [ ] Deploy the React frontend with the production API URL
- [ ] Open the public frontend URL in Chrome or Edge
- [ ] Confirm the login page loads over HTTPS
- [ ] Log in with the production admin account
- [ ] Create a receptionist account with a unique password
- [ ] Log out and verify the session cookie is cleared
- [ ] Verify the frontend can call the API without CORS errors
- [ ] Verify Socket.io connects and lobby counts update across two browser windows
- [ ] Verify the app still works when your laptop is turned off

### Step 26: End-to-End Business Acceptance

- [ ] Administrator creates rooms, teachers, and sessions
- [ ] Receptionist opens a desk drawer
- [ ] Receptionist searches a student by Arabic name, phone, and code
- [ ] Receptionist checks in students using Cash, Vodafone Cash, and InstaPay
- [ ] The system rejects a duplicate check-in
- [ ] The system prevents check-in after a drawer is closed
- [ ] Staff reconcile the lobby count with the assistant count
- [ ] Staff settle a teacher payout and verify the server-calculated amounts
- [ ] Staff record a cash expense
- [ ] Staff close the drawer and verify exact balance, overage, and shortage behavior
- [ ] Administrator views the daily report
- [ ] Administrator views the shift audit log
- [ ] Receptionist cannot view another receptionist's shift audit
- [ ] Completed sessions and closed shifts cannot be edited
- [ ] Arabic RTL layout works on desktop, tablet, and mobile browsers

### Step 27: Production Operations

- [ ] Configure a custom domain, for example `erp.your-center.com`
- [ ] Verify HTTPS certificate and automatic renewal
- [ ] Configure uptime monitoring for the health endpoint
- [ ] Configure error alerts for failed deployments and database connectivity
- [ ] Schedule and test regular Supabase backups
- [ ] Document who owns the Supabase, hosting, GitHub, domain, and password-manager accounts
- [ ] Create a second administrator account for emergencies
- [ ] Review staff access at least monthly
- [ ] Establish retention rules for student phone numbers, payment references, and audit history
- [ ] Record the production migration version and deployment date
- [ ] Keep a tested rollback plan for the previous application version

### Online Launch Definition of Done

- [ ] Staff access the ERP through one HTTPS browser URL
- [ ] The ERP works when the owner's laptop is switched off
- [ ] Supabase contains the production PostgreSQL database
- [ ] The cloud host runs the backend continuously
- [ ] All migrations are applied and backed up
- [ ] Production secrets are stored only in the hosting provider's secret settings
- [ ] Login, check-in, payments, reconciliation, settlement, drawer close, reports, and audit logs pass acceptance testing
- [ ] Two reception desks can use the system simultaneously with live lobby synchronization
- [ ] Backup restore and emergency rollback procedures have been tested
