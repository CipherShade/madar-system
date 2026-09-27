# Madar Super Admin — Verified State + Remaining Work (Phase 5 / Platform Operations)

> Status: **Phases 1-5 implemented.** Platform models + migrations, the server console surface, and
> the 16-section platform-operations console are complete. `npx tsc -b`,
> `npx tsc -p tsconfig.server.json --noEmit`, `npm run test:unit` (**223/223 pass**), and
> `npm run build` are all green. Updated as work lands.

## Phase 1-2 landed (platform models + server surface)

- `20260924000000_platform_models` — `SuperAdminSession`, `SuperAdminAuditLog`, `FeatureFlag` /
> `FeatureFlagTarget`, `PlatformNotification`, `SystemHealthEvent`, `SystemSetting`, `SupportNote`,
> `UsageOverride`, and the center `searchName` column.
- `20260925000000_platform_billing_and_users` — `Tenant.discountBalance` / `creditBalance`,
  `User.lastLoginAt`, `User.searchName`, and `SubscriptionAdjustment`
  (`type`: `DISCOUNT | CREDIT | REFUND`, `reason`, `createdById`). Both migrations are applied:
  `prisma migrate status` reports the database up to date.
- `src/server/modules/admin/`: `admin.ts` (platform KPIs, center CRUD, limits, extend-trial,
  suspend, 360° view, view-as), `platformUsers.ts` (cross-center user directory),
  `platformUsage.ts` (per-center usage vs. limits), `platformBilling.ts` (subscriptions,
  cancellation/reactivate, discount/credit/refund, adjustment history, monthly revenue),
  `platformOps.ts` (notifications, feature flags, health, settings, data, security, support notes,
  usage overrides, account), plus `platformHelpers.ts` and the pure `billingMath.ts`.
- All routes sit behind `SUPER_ADMIN_GATE` (`authenticate` + `requireRoles(Role.SUPER_ADMIN)`), and
  the full route list is enumerated in `tests/platform-ops.test.ts` so no endpoint can be added
  without a matching auth/RBAC test.
- **Audit guarantee:** each mutation and its `SuperAdminAuditLog` row commit in one
  `prisma.$transaction` via `recordSuperAdminAudit(input, tx)` — fail-closed. Passwords, temporary
  passwords, and impersonation tokens are never written to the audit log.

## Phase 3 landed (super-admin console UI)

- `GET /api/admin/console-stats` — MRR, active/trial/suspended/new centers, open support notes,
  pending notifications, active usage overrides, open view-as sessions, recent health events.
- **View-as-Center** (`POST /api/admin/tenants/:id/view-as` + `POST /api/admin/view-as/return`) —
  mandatory audit reason, 30-minute tenant-scoped impersonation token, persistent banner with a
  live expiry countdown and auto-clear, an end-session action, and a scoped center preview.
- The impersonation token is signed with the target center's `ADMIN` role + `tenantId`, so it
  passes center guards and is hard-scoped to one tenant by `request.user.tenantId`.

## Phase 4 landed (16-section console)

**Sections** (`src/client/features/admin/sections/registry.ts`, grouped sidebar,
`sessionStorage`-remembered selection, `refreshToken`-keyed remount):

| Group | Sections |
| :--- | :--- |
| Monitor | Overview, Health, Usage, Revenue |
| Manage | Centers, Users, Subscriptions & Billing, Plans, Support |
| Configure | Notifications, Feature Flags, Settings |
| Govern | Data, Security, Audit, Account |

- **Centers** — searchable/paginated list, create center + owner admin, per-center limit
  overrides, extend-trial, suspend/reactivate, and the Center 360° drill-down (usage counts,
  subscription timeline, recent platform audit, owner contact).
- **Users** — cross-center directory with search/filters, user detail, create/edit role + active
  state, one-time temporary-password reset, and session revocation. A suspended center or a center
  at its user cap is refused server-side.
- **Subscriptions & Billing** — subscription list with status totals and stale-`PENDING` flag,
  record subscription, cancel (period-end or immediate), reactivate, discount, credit, refund, the
  adjustment history with per-type totals, and the pending-payment verify/reject flow.
- **Usage** — per-center `USERS / RECEPTIONISTS / STUDENTS / VISITS / BRANCHES` against limits,
  including active `UsageOverride` extras and the 80% warning level; grants/revocations live here.
- **Revenue** — monthly collected revenue (new, renewals, cancellations, refunds, discounts,
  credits, net) from real `Subscription` / `SubscriptionAdjustment` rows.
- **Plans** — read-only adapter over `src/shared/constants/plans.ts`; the console never edits prices.
- **Health** — measured checks only (database reachability, migration state, table counts) plus
  `SystemHealthEvent`s recorded automatically by the async error handler on every 5xx.
- **Data** — real JSON/CSV exports of centers and users; migration state, table counts, and
  database size. Backup status is the provider's responsibility and is never fabricated.
- **Security** — active session list with revoke, and the authentication history log.
- **Account** — own profile update and password change (all other sessions revoked).
- Shared pieces live beside the sections: `registry.ts`, `primitives.tsx`, `hooks.ts`, `format.ts`,
  `plan.ts`, `types.ts`. Dead sections (Payments, Overrides, Help) were removed once their routes
  moved to the sections above.
- All UI strings live under `superAdmin.*` in `src/client/locales/{ar,en}/common.json`,
  Arabic-first RTL, no hardcoded text; both dictionaries are key-identical (verified by script).

## Tests & verification

- `tests/platform-ops.test.ts` — auth gate (401 anonymous / 401 malformed token), RBAC separation
  (center `ADMIN` → 403, `RECEPTIONIST` → 403, impersonation token → 403, forged role → 403),
  `SUPER_ADMIN` passes every read route, and pre-DB input validation — enumerated over the complete
  read/write route lists.
- `tests/billing-math.test.ts` — 32 tests over the pure billing domain functions.
- `tests/integration/db/platform-audit-atomicity.test.ts` — DB-gated audit/mutation atomicity
  (skipped unless `TEST_DATABASE_URL` is set).
- `npm run test:unit` → 223/223 pass. `npx tsc -b`, `npx tsc -p tsconfig.server.json --noEmit`, and
  `npm run build` are clean.
- `npm run test:frontend` cannot run: `vitest` is declared in `devDependencies` but missing from the
  installed `node_modules` (pre-existing gap; `npm ci` would install it).

## Deliberately not built: internal-staff permission tiers

An earlier draft proposed granular `Permission`-key guards and internal staff accounts. The owner
directive for the platform console is a **sole operator**: one platform owner, no internal admin
team, no employee/role management machinery. Every platform route therefore gates on `SUPER_ADMIN`
role only, which is the strictest and simplest boundary. The `Permission` catalog in
`src/types/permissions.ts` stays as-is for the center-side RBAC and is not enforced at platform-route
level by design. The `super_admin_permissions` / `super_admin_user_permissions` tables exist in the
schema but stay unused. Two-factor authentication is likewise not supported by the console.

## Phase 6 (not started — confirm with the owner first)

- Notification delivery: notifications are recorded with a status/schedule; there is no in-app inbox
  or WebSocket fan-out yet.
- Scheduled data exports and retention enforcement for audit rows.
- Optional: per-center usage-override timeline inside Center 360°.
- Release items outside this console: acceptance sessions on a staging database, accessibility
  checks, and the audit/retention policy.

Non-goals: internal-staff RBAC, impersonated multi-operator workflows, or any metric that cannot be
measured from the database or the server's own instrumentation.
