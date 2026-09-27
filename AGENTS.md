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
