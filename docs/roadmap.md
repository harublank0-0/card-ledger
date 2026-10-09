# Card Ledger — Roadmap

Status: **proposed**. Tickets are small and independently testable. Work one ticket at a time; do not start the next without approval. Every ticket ends with `npm run check`, typecheck, and tests passing.

Development priorities:

1. Complete the core personal finance MVP (Phases 0–1).
2. Make self-hosting reliable (Phase 2).
3. Prepare public GitHub documentation (Phase 3).
4. Gather community feedback (Phase 4).
5. Consider managed cloud infrastructure (Phase 5).
6. Introduce cloud billing only after validating demand.

Global requirements for every feature ticket:

- All data access is authenticated and **user-scoped** (see [architecture §5](./architecture.md#5-authentication-and-data-isolation)); tests include an unauthenticated call and a cross-user access attempt.
- Server input validated with `.validator()` + Zod.
- Money = integer minor units; dates = calendar dates; no floats.
- No sensitive data (amounts, notes, descriptions) in logs; no secrets or real financial data committed.
- No telemetry or calls to external services other than operator-configured SMTP.

Ticket format: **ID — Title** · Objective · Scope · Acceptance criteria (AC) · Dependencies · Tests.

---

## Phase 0 — Foundation

### F-01 — Tooling and environment
- **Objective:** Test runner and validated configuration before any feature work.
- **Scope:** Add Vitest and `test` script; add `src/generated` to `.gitignore`; extend `src/env.ts` with `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `SIGNUP_MODE` (default `first-user`), `MCP_ENABLED` (default false), optional `SMTP_*`, `DEFAULT_TIMEZONE`; make `src/db.ts` use validated env; add typecheck script (`tsc --noEmit`).
- **AC:** App refuses to start with missing/invalid required env and says which; no server variable is reachable from client code; `npm test`, `npm run check`, typecheck run clean.
- **Dependencies:** none.
- **Tests:** env parsing unit tests (defaults, invalid `SIGNUP_MODE`, empty strings).

### F-02 — Remove starter demos and gate MCP
- **Objective:** Remove insecure/demo code before it can ship.
- **Scope:** Delete `Todo` model, demo seed content, `src/mcp-todos.ts`; replace placeholder home and root title; `/mcp` returns 404 unless `MCP_ENABLED=true`, and then requires an authenticated session (tool set empty until a feature needs it); initial migration reset (no data exists).
- **AC:** No file writes to `mcp-todos.json`; `/mcp` is 404 by default; unauthenticated request to enabled `/mcp` is 401.
- **Dependencies:** F-01, F-03 for the authenticated branch (the enabled branch can ship returning 404 until F-03 lands).
- **Tests:** route handler tests for disabled / enabled-unauthenticated.

### F-03 — Better Auth persistence and sign-up policy
- **Objective:** Persist users and sessions in PostgreSQL via Prisma; configurable registration.
- **Scope:** Better Auth Prisma adapter; generate auth models; first migration; secure cookie options (production `Secure`); `SIGNUP_MODE` enforcement (`first-user`: allow sign-up only while zero users exist; `closed`: never; `open`: always) implemented with Better Auth hooks/config, not custom auth; confirm built-in rate limiting is on.
- **AC:** Sign-up, sign-in, sign-out persist across server restarts; second sign-up rejected under `first-user`; session cookie `HttpOnly`, `SameSite`, and `Secure` in production.
- **Dependencies:** F-01.
- **Tests:** integration tests against Postgres for each `SIGNUP_MODE`; unit test for the mode decision function.

### F-04 — Auth UI and server-function auth middleware
- **Objective:** Usable sign-in/up and a reusable authorization boundary.
- **Scope:** Sign-in and sign-up pages (TanStack Form, shadcn components); `_authed` layout route redirecting to sign-in (UX only); `authMiddleware` (server-function middleware) providing `context.user`; sign-out in header; hide sign-up UI when mode forbids it.
- **AC:** Direct call to a protected server function without a session rejects before touching the database; redirect does not leak protected content.
- **Dependencies:** F-03.
- **Tests:** middleware test (no session → rejects, session → context user); example protected server fn used only in tests.

### F-05 — Core pure libraries: money and calendar dates
- **Objective:** Correct, dependency-free primitives all features share.
- **Scope:** `src/lib/money.ts` (currency table with exponents, parse "12.50" → minor, format via `Intl.NumberFormat`, add/subtract with same-currency guard, Zod schema for currency/amount); `src/lib/calendar-date.ts` (`YYYY-MM-DD` type, add days/months/years with month-end clamp, day-of-month clamp, `todayIn(timezone)`, diff in days, validation).
- **AC:** No floating-point arithmetic on money; mixed-currency operations throw; Jan 31 + 1 month = Feb 28/29; leap-year rules correct; `todayIn('Asia/Kathmandu')` differs from UTC date when expected (UTC+5:45).
- **Dependencies:** F-01.
- **Tests:** table-driven unit tests: rounding/parsing edge cases (`0.1+0.2`, `1,000.00`, three-decimal rejection), month-end, leap years (2024-02-29 + 1 year), tz day boundaries.

### F-06 — LICENSE and contribution terms
- **Objective:** Make the legal basis of the project explicit before any outside contribution.
- **Scope:** Add AGPLv3 `LICENSE`; `package.json` `license` field (`AGPL-3.0-only` or `-or-later` — decide and record in ADR 0001); minimal `CONTRIBUTING.md` stating DCO sign-off (`git commit -s`) and that contributions are licensed under the project license.
- **AC:** License text unmodified from the FSF; ADR 0001 matches.
- **Dependencies:** none.
- **Tests:** n/a (review).

---

## Phase 1 — Core MVP

### M-01 — Categories
- **Objective:** User-owned expense categories.
- **Scope:** `Category` model + migration; service + server functions (list, create, rename, archive/unarchive); default categories created for a user on first use; unique name per user.
- **AC:** Archived categories remain on historical transactions and are hidden from pickers by default.
- **Dependencies:** F-04.
- **Tests:** service tests incl. cross-user access and duplicate names; unauthenticated rejection.

### M-02 — Payment methods
- **Objective:** Manage credit cards without sensitive data.
- **Scope:** `PaymentMethod` model + migration; Zod schema (`last4` exactly 4 digits, currency, credit limit, statement day, due day); CRUD, archive; UI list/create/edit using shadcn + TanStack Form; UI copy states that card numbers are never stored.
- **AC:** Input longer than 4 digits is rejected server-side; archived cards excluded from pickers but retained; limit stored as minor units.
- **Dependencies:** F-05, M-01 not required.
- **Tests:** schema validation tests; service tests with cross-user and unauthenticated cases.

### M-03 — Recurrence engine (pure)
- **Objective:** Compute subscription occurrences correctly.
- **Scope:** `subscriptions.logic.ts`: `nextOccurrences(anchor, interval, count|unit, from, limit, {expiresOn, autoRenew, status})`; always derived from the anchor (no chained clamping drift); weekly, monthly, quarterly (3 months), yearly, custom N of week/month/year.
- **AC:** Anchor Jan 31 monthly → Feb 28 (29), Mar 31, Apr 30, May 31; anchor Feb 29 yearly → Feb 28 in non-leap years, Feb 29 in leap years; occurrences stop after `expiresOn`; none when cancelled or auto-renew disabled past the current period.
- **Dependencies:** F-05.
- **Tests:** extensive table-driven tests incl. leap years and long-running series (e.g., 10 years).

### M-04 — Subscriptions CRUD
- **Objective:** Record subscriptions linked to cards.
- **Scope:** `Subscription` model + migration; CRUD + archive; link to an owned payment method (ownership verified); list showing next renewal and monthly-equivalent cost per currency; UI.
- **AC:** Linking another user's payment method is rejected; renewals are never persisted as transactions.
- **Dependencies:** M-02, M-03.
- **Tests:** service tests (ownership, validation, cross-user); monthly-equivalent calculation unit tests.

### M-05 — Subscription lifecycle and upcoming renewals
- **Objective:** Cancellation, expiry, deadlines.
- **Scope:** Cancel (sets status, `cancelledOn`), reactivate, auto-renew off, expiry date, cancellation deadline; `upcomingRenewals(userId, window)` query using M-03; states shown in UI.
- **AC:** A cancelled subscription yields no future renewals after the paid period; expired derived consistently; deadline shown when set.
- **Dependencies:** M-04.
- **Tests:** state-transition logic tests; upcoming list tests across timezones' "today".

### M-06 — Transactions (expenses and refunds)
- **Objective:** Record spending and refunds.
- **Scope:** `Transaction` model + migration; create/edit/delete (hard delete allowed for user-entered transactions, with confirmation; refunds block deletion of an expense that has refunds); category, card, notes; refund referencing an expense (same user, same currency, cumulative ≤ original); optional `subscriptionId` for recording an actual charge.
- **AC:** Card bill payments cannot be recorded as transactions (UI directs to statements); refund validation enforced server-side.
- **Dependencies:** M-01, M-02, M-04 (optional link).
- **Tests:** refund rule tests; ownership of category/card/subscription ids; cross-user tests.

### M-07 — Transaction list and filters
- **Objective:** Find transactions.
- **Scope:** Server-paginated list filtered by date range, card, category, type; URL search params via TanStack Router validated with Zod; totals per currency for the filtered set.
- **AC:** Filters survive reload/share; pagination stable (order by `occurredOn desc, id`).
- **Dependencies:** M-06.
- **Tests:** query filter tests; search-param schema tests; cross-user isolation.

### M-08 — Card statements and payments
- **Objective:** Track what is owed to the bank.
- **Scope:** `CardStatement` and `StatementPayment` models + migration; CRUD; outstanding = balance − payments (pure function); overpayment handling; due-date display and overdue state; no coupling with manually entered transactions.
- **AC:** Payment currency equals statement currency; period uniqueness per card; outstanding never silently derived from transactions.
- **Dependencies:** M-02.
- **Tests:** balance calculation tests (partial, exact, over-payment); uniqueness; cross-user.

### M-09 — Dashboard aggregations
- **Objective:** Correct numbers for the dashboard.
- **Scope:** Pure aggregation functions + one authenticated server function: monthly spending per currency (expenses − refunds, statement payments excluded), active subscription count, monthly commitment per currency, upcoming renewals, upcoming statement due dates, recent transactions, spending by category.
- **AC:** Different currencies never summed; the "month" boundary uses the user's timezone; archived entities included in historical totals.
- **Dependencies:** M-05, M-06, M-08.
- **Tests:** aggregation unit tests with multi-currency fixtures and month boundaries.

### M-10 — Dashboard UI
- **Objective:** Present M-09 data.
- **Scope:** Responsive, accessible dashboard with shadcn/Tailwind; per-currency sections; empty states; category breakdown as accessible table + simple chart (no new chart dependency unless justified).
- **AC:** Usable at phone width; keyboard accessible; no layout shift on load.
- **Dependencies:** M-09.
- **Tests:** component tests for empty/multi-currency states.

### M-11 — Notification preferences
- **Objective:** Per-user reminder settings.
- **Scope:** `NotificationPreference` model + migration; settings page (timezone from IANA list, thresholds default 7/3/1, per-kind toggles); preferences row created lazily with defaults; banner shown when SMTP is not configured.
- **AC:** Invalid timezone/offsets rejected; defaults applied; default timezone `Asia/Kathmandu`.
- **Dependencies:** F-04.
- **Tests:** schema tests; defaults; cross-user.

### M-12 — Reminder planner (pure)
- **Objective:** Decide which reminders are due.
- **Scope:** `computeReminders(now, prefs, subscriptions, statements)` returning `{kind, entityId, eventDate, offsetDays}`; covers renewals, expiry, cancellation deadlines, card payment due; excludes cancelled/archived/paid-in-full items.
- **AC:** Day arithmetic in the user's timezone; an item due in exactly 7/3/1 days yields one reminder per offset; settings toggles respected.
- **Dependencies:** M-03, M-05, M-08, M-11.
- **Tests:** table-driven tests incl. timezone day boundary (Kathmandu vs UTC), month-end, skipped days (job outage catch-up policy documented and tested).

### M-13 — Reminder delivery
- **Objective:** Idempotent, retryable email delivery with a log.
- **Scope:** `mailer.server.ts` interface with SMTP (Nodemailer — justify dependency in PR) and console transports; `scripts/send-reminders.ts`: plan → insert `NotificationLog` (unique key) → send → mark `SENT`/`FAILED` with attempts, backoff, retry limit; exit cleanly without SMTP; email content avoids unnecessary financial detail (name + date + amount optional per preference); settings page shows recent delivery log.
- **AC:** Two concurrent runs send one email per reminder; failure retried with backoff then marked failed; errors logged without PII.
- **Dependencies:** M-12.
- **Tests:** integration tests with Postgres and a fake transport: duplicate prevention under concurrent runs, retry/backoff, SMTP-missing path.

### M-14 — Data export (CSV and JSON)
- **Objective:** Data portability.
- **Scope:** Authenticated server route(s) streaming a user's data: JSON (single document with `version`, all entities, ISO dates, integer minor units + currency) and CSV (per-entity files in a zip, or one CSV per entity); documented format in `docs/data-format.md`; CSV injection protection (prefix cells starting with `= + - @`).
- **AC:** Export contains only the caller's records; re-reading the JSON reproduces totals; unauthenticated request is rejected.
- **Dependencies:** M-06, M-08 (and earlier features).
- **Tests:** cross-user isolation; round-trip totals; CSV injection escaping.

### M-15 — Account deletion
- **Objective:** User can erase their data.
- **Scope:** Settings action requiring password re-entry and typed confirmation, offering export first; deletes user via Better Auth, cascading all owned rows; confirmation of completeness.
- **AC:** No orphaned rows remain; sessions invalidated.
- **Dependencies:** M-14.
- **Tests:** integration test counting rows per table before/after for two users (only the deleted user's rows vanish).

### M-16 — Synthetic demo data
- **Objective:** Safe sample data for development, screenshots, and evaluation.
- **Scope:** `prisma/seed.ts` rewritten to create a demo user and clearly fictional cards, subscriptions, transactions, statements; `npm run db:seed`; refuses in production unless explicitly forced; documented as synthetic only.
- **AC:** Seed is idempotent; no realistic card numbers or real merchant account data.
- **Dependencies:** M-08 (and earlier features).
- **Tests:** seed runs twice without duplicates; production guard.

---

## Phase 2 — Reliable self-hosting

### S-01 — Dockerfile and compose
- **Objective:** One-command self-hosted deployment.
- **Scope:** Multi-stage `Dockerfile` (build with npm, run as non-root, includes Prisma migrate-deploy and the reminder script); `compose.yaml` with `app`, `db` (PostgreSQL, **no published port**, private network, volume), `reminders` (cron-style loop or documented host cron), health checks; migrations on start.
- **AC:** Fresh clone → `docker compose up` produces a working app; DB not reachable from host network; restart preserves data.
- **Dependencies:** M-13.
- **Tests:** CI smoke test builds the image and hits the health endpoint.

### S-02 — `.env.example` and self-hosting guide
- **Objective:** Operators can install and upgrade without guessing.
- **Scope:** `.env.example` with placeholders only; `docs/self-hosting.md`: requirements, secret generation, first-user setup, SIGNUP_MODE, SMTP setup, reverse proxy/HTTPS, Tailscale access, upgrade procedure, troubleshooting.
- **AC:** Guide followed on a clean VPS works; no real values anywhere.
- **Dependencies:** S-01.
- **Tests:** manual walk-through checklist recorded in the PR.

### S-03 — Backup and restore
- **Objective:** Recoverable data.
- **Scope:** `scripts/backup.sh` (`pg_dump` to a timestamped file, retention), restore runbook, scheduled backup example; periodic restore-drill instructions; mention encryption of off-host copies.
- **AC:** A backup restores into an empty database and the app works.
- **Dependencies:** S-01.
- **Tests:** scripted restore drill in CI or documented manual test.

### S-04 — Health endpoint and startup checks
- **Objective:** Operability.
- **Scope:** `/api/health` (DB reachable, migrations applied; no sensitive info); startup validation message when env invalid; structured logs without financial data.
- **AC:** Health used by compose health checks.
- **Dependencies:** S-01.
- **Tests:** handler tests for healthy/unhealthy.

---

## Phase 3 — Public GitHub readiness

### O-01 — README
- **Objective:** Clear project front page.
- **Scope:** Replace starter README: what it is, principles (self-hosted, no telemetry), screenshots using demo data, quickstart, links to docs, license, status/roadmap.
- **Dependencies:** M-16, S-02.

### O-02 — CONTRIBUTING, SECURITY, CODE_OF_CONDUCT
- **Objective:** Contribution and disclosure process.
- **Scope:** Full `CONTRIBUTING.md` (setup, branch/commit conventions—Conventional Commits—DCO sign-off, test requirements), `SECURITY.md` (private reporting channel, supported versions, response expectations), `CODE_OF_CONDUCT.md`.
- **Dependencies:** F-06.

### O-03 — GitHub Actions CI
- **Objective:** Automated quality gate.
- **Scope:** Workflow on PR/push: install (`npm ci`), `npm run check`, typecheck, tests (Postgres service container), build; DCO check; dependency audit as informational; no secrets required.
- **AC:** Required checks pass on a clean PR; fork PRs work without secrets.
- **Dependencies:** F-01.

### O-04 — Issue and PR templates
- **Objective:** Better reports.
- **Scope:** Bug and feature issue templates (warning: do not paste real financial data), PR template with checklist (tests, DCO, no secrets), `config.yml` linking to security reporting.
- **Dependencies:** O-02.

### O-05 — Pre-publication audit
- **Objective:** Safe first public push.
- **Scope:** Scan history and working tree for secrets/real data (`.env*`, seeds, screenshots); verify `.gitignore`; confirm default config is private-by-default (MCP off, signup first-user); review dependencies' licenses against AGPLv3 compatibility.
- **AC:** Checklist signed off in the PR.
- **Dependencies:** O-01–O-04.

---

## Phase 4 — Community feedback (unscheduled)

Candidates, to be prioritized from real feedback: CSV import (bank exports), recurring-transaction templates, multi-currency conversion with user-provided rates, additional reminder channels, budget limits, i18n, API tokens.

## Phase 5 — Managed cloud (not planned in detail)

Only constraints are recorded now: same codebase and image; `SIGNUP_MODE=open`; managed SMTP, backups, and updates handled outside the application; revisit data-isolation hardening (row-level security) and operational monitoring before multi-user hosting at scale; **no billing code until demand is validated**.
