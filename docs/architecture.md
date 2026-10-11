# Card Ledger — Architecture

Status: **proposed**. The repository is a freshly scaffolded TanStack Start app with no product features. Anything not marked "exists" below is a proposal that will be refined ticket by ticket (see [roadmap.md](./roadmap.md)).

## 1. Product direction

Card Ledger is an **open-source (AGPLv3), self-hostable personal finance and subscription tracker**: credit cards, expenses, recurring subscriptions, statement due dates, and email reminders.

Principles:

1. **Self-hosting is free and complete.** All core functionality ships in the open-source edition. No feature locks, license keys, or verification.
2. **Users own their data.** Per-user CSV/JSON export, account deletion, no vendor lock-in.
3. **Self-hosted installs are independent.** No required connection to a Card Ledger service. No telemetry or external analytics. The only outbound network call is the operator-configured SMTP server.
4. **One codebase.** Self-hosted and a possible future managed cloud differ only by configuration, not by code branches or "editions".
5. **Sensitive by default.** Never store full card numbers, CVV, PIN, or banking credentials — only a label and last four digits. Never commit secrets or real financial records.
6. **Correctness over features.** Money and dates are handled by small, pure, heavily tested modules.

Priorities, in order: financial correctness, security, maintainability, developer experience, simplicity, performance.

Non-goals for the MVP: organizations/workspaces, multi-tenant database infrastructure, billing, currency conversion, bank sync, mobile apps.

## 2. What the starter already provides

| Concern | Exists | Notes |
|---|---|---|
| Framework / routing | TanStack Start 1.168, Router 1.170 (file routes in `src/routes`) | `routeTree.gen.ts` is generated; never edit |
| Server runtime | Nitro via `vite.config.ts` | Build → `node dist/server/index.mjs` |
| DB | Prisma 7.10, `prisma-client` generator → `src/generated/prisma`, `@prisma/adapter-pg` | `src/db.ts`, `src/database-url.ts`, `prisma.config.ts` |
| Auth | Better Auth 1.7 (email/password, `tanstackStartCookies`) | **No database adapter yet** — users/sessions are not persisted. Route at `src/routes/api/auth/$.ts`; client at `src/lib/auth-client.ts` |
| Env validation | `@t3-oss/env-core` in `src/env.ts` | Only `SERVER_URL`, `VITE_APP_TITLE` today; DB/auth variables not yet validated |
| UI | Tailwind 4, shadcn/ui (button, input, label, select, slider, switch, textarea) | Alias `#/*` → `src/*` |
| Forms / data | TanStack Form, TanStack Query (SSR-integrated in `src/router.tsx`) | |
| Lint/format | Biome (tabs, double quotes) | No ESLint/Prettier |
| MCP | `/mcp` route + demo `addTodo` tool | **Unauthenticated**, writes `mcp-todos.json` to disk |
| Tests | none | Vitest proposed |

Starter leftovers to remove (ticket F-02): the `Todo` model, `prisma/seed.ts` demo content, `src/mcp-todos.ts`, the placeholder home page and root title.

## 3. Layers

```
React UI (routes + feature components)
        |
TanStack Router (file routes, loaders, search params)
        |
TanStack Start server functions   <- auth middleware, .validator() with Zod
        |
Feature services (business rules, user-scoped queries)
        |
Prisma ORM
        |
PostgreSQL
```

Additional entry points that reuse the same services:

- **Server routes** (`createFileRoute(...)({ server: { handlers } })`) for non-RPC HTTP: Better Auth, data export downloads, health check.
- **Scheduled job**: a standalone script (`scripts/send-reminders.ts`) run by cron. It imports the same service modules; it does not go through HTTP.

Rules:

- Loaders are isomorphic. **Database access and secrets live only in server functions/services**, never directly in a loader or component.
- **Authorization is enforced in the data boundary** (server-function middleware and services), never only via route `beforeLoad`. Route guards are UX.
- Validate all input on the server with `.validator()` and Zod. Client-side validation is convenience only.
- Server-only modules use `*.server.ts` (or the `server-only` marker) so import protection prevents bundling them into the client.
- No generic repository layer. Services call Prisma directly.
- TanStack Query is used where it helps (cache, invalidation, optimistic updates); a simple read can be a loader calling a server function plus `router.invalidate()` after mutations.

## 4. Directory layout (proposed)

Adapt to starter conventions; do not move existing starter files.

```
src/
  routes/                      # thin: routing, loaders, page composition
    _authed/                   # layout route; redirects to /sign-in
      index.tsx                # dashboard
      payment-methods/ subscriptions/ transactions/ statements/ settings/
    api/auth/$.ts              # exists (Better Auth)
    api/export/...             # CSV/JSON download (server route)
    api/health.ts
  features/
    payment-methods/
      payment-methods.schemas.ts    # Zod (shared client/server)
      payment-methods.service.server.ts
      payment-methods.functions.ts  # createServerFn wrappers
      components/
    subscriptions/ transactions/ statements/ notifications/ dashboard/ settings/ categories/
  lib/
    money.ts                   # pure: minor-unit math, formatting, currency table
    calendar-date.ts           # pure: date-only arithmetic, month-end clamp, tz "today"
    auth.ts auth-client.ts     # exist
    auth-middleware.ts         # session -> context.user (server fn middleware)
    mailer.server.ts
  components/ui/               # exists (shadcn)
  db.ts env.ts                 # exist
scripts/send-reminders.ts      # cron entry
prisma/                        # schema, migrations, seed (demo data)
docs/
```

Pure logic (recurrence, reminder planning, statement balances, dashboard aggregation) lives in `*.logic.ts` files with **no React and no Prisma imports**, so it is unit-testable without a database.

## 5. Authentication and data isolation

- Better Auth owns users, sessions, and passwords. Persisted through its Prisma adapter (ticket F-03). No custom auth.
- A single `authMiddleware` (server-function middleware) resolves the session from request headers and puts `context.user` in scope. Every server function touching private data uses it.
- **Services take `userId` as an explicit argument** and every query is scoped by it: `findFirst({ where: { id, userId } })`, `updateMany({ where: { id, userId } })` — never lookup by `id` alone. Client-supplied foreign IDs (e.g. `paymentMethodId` on a transaction) are verified to belong to the same user before use.
- Every domain table has `userId` with an index; unique constraints that should be per-user include `userId`.
- Each feature must ship a **cross-user access test** (user B cannot read/update/delete user A's record; unauthenticated call is rejected).
- Postgres row-level security is considered and deferred; see [ADR 0003](./decisions/0003-user-scoped-data-isolation.md).
- Sign-up policy is configuration: `SIGNUP_MODE=first-user|open|closed`. Self-host default is `first-user` (the first account is created, then registration closes). Email addresses are not verified, so `open` combined with SMTP lets anyone have reminders sent to any address; this is documented and logged at start-up, not prevented (a verification flow is deferred, see the roadmap).

## 6. Configuration and deployment model

One build, behavior driven by environment variables validated at startup with T3Env:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Auth secret and public base URL |
| `SIGNUP_MODE` | `first-user` (default) / `open` / `closed` |
| `SMTP_HOST/PORT/USER/PASSWORD/FROM`, `SMTP_SECURE` | Optional; reminders disabled if absent |
| `MCP_ENABLED` | Default `false`; when true, `/mcp` still requires authentication |
| `DEFAULT_TIMEZONE` | Default `Asia/Kathmandu` for new users' preferences |

Server-only variables never use the `VITE_` prefix. Env is read inside handlers/factories, not at module scope in code shared with the client.

Self-host target (Phase 2): multi-stage Dockerfile (non-root), `compose.yaml` with app + PostgreSQL on a private network (Postgres port **not** published), migrations applied on start, a cron-driven reminder job, documented HTTPS (reverse proxy) and Tailscale private access, and a backup/restore runbook.

A future managed cloud would run the **same image** with `SIGNUP_MODE=open`, managed SMTP, and operator-run backups, and would need email verification first (see §5). No cloud code is planned now.

## 7. Domain overview

Features (details in [database.md](./database.md)):

- **Categories** — per-user, archivable, seeded with sensible defaults.
- **Payment methods** — credit cards: name, issuer, last four, currency, credit limit, statement day, payment due day. Archive, never delete.
- **Subscriptions** — name, amount + currency, billing interval (weekly / monthly / quarterly / yearly / custom N units), anchor date, status (active / cancelled / expired), auto-renew, expiry, cancellation deadline, optional payment method. **Upcoming renewals are computed, not stored**, and never create transactions.
- **Transactions** — expenses and refunds, with category, optional card, notes. A refund references its original transaction. Card bill payments are **not** transactions (see statements).
- **Card statements** — per card and billing period: statement balance and due date entered from bank records, plus payments against it. Outstanding = statement balance − payments. Manually entered expenses are never assumed to equal the statement.
- **Dashboard** — monthly spending, active subscriptions and monthly commitment, upcoming renewals and due dates, recent transactions, spending by category. **Totals are per currency**; amounts in different currencies are never summed.
- **Notifications** — preferences (thresholds default 7/3/1 days, timezone default `Asia/Kathmandu`) and a delivery log.
- **Export / delete** — CSV and JSON export of all of a user's records; account deletion cascading from the user.

## 8. Money and time

Full rationale in ADRs [0004](./decisions/0004-money-integer-minor-units.md) and [0005](./decisions/0005-calendar-dates-and-timezones.md).

- Money is an **integer count of minor units** plus an ISO 4217 code. No floats. Minor-unit exponent comes from a small currency table in `money.ts` (NPR/USD = 2).
- Date-only things (due dates, renewal dates, expiry, cancellation deadlines, billing periods) are **calendar dates** (`@db.Date`, `YYYY-MM-DD` strings in code), not timestamps.
- Real events (`createdAt`, notification `sentAt`) are UTC timestamps.
- "Today" for reminders is computed in the user's configured timezone via `Intl.DateTimeFormat`; Node 24 has no `Temporal`, so `calendar-date.ts` is a small, fully tested module (month-end clamping, leap years).

## 9. Reminders

- `computeReminders(today, userPrefs, entities)` is a pure function returning the reminders due (kind, entity, event date, offset days).
- The runner (`scripts/send-reminders.ts`, cron, e.g. hourly) loads per-user data, calls the planner, then for each reminder **inserts a `NotificationLog` row first**. A unique key `(userId, kind, entityId, eventDate, offsetDays, channel)` makes the claim atomic and prevents duplicates across overlapping runs. Only the run that wins the insert sends.
- Status transitions: `PENDING → SENT | FAILED`; failed rows are retried up to a limit with backoff; delivery errors are recorded without sensitive content.
- If SMTP is not configured the runner exits cleanly and the settings page says reminders are disabled.
- No Redis/BullMQ. See [ADR 0006](./decisions/0006-reminder-job-standalone-cron.md).

## 10. Security model

- Better Auth sessions, `HttpOnly`/`Secure`/`SameSite` cookies, built-in rate limiting on auth endpoints.
- Server-side authorization on every server function and server route; user-scoped queries; direct unauthenticated-call tests.
- Zod validation on all inputs; money/date parsing in one place.
- No sensitive data in logs (amounts, notes, and descriptions are not logged); errors returned to clients are generic.
- Secrets only via environment; `.env*` ignored; nothing real committed. Demo data is synthetic.
- Production: HTTPS, Tailscale or other private access, Postgres not exposed, automated backups with a documented restore drill.
- MCP stays disabled by default; if enabled, requires authentication and per-user scoping.
- Vulnerability disclosure via `SECURITY.md` (Phase 3).

## 11. Testing

Vitest (to be added in F-01). Priority order: money handling → calendar-date and recurrence (month-end, leap years) → statement balances → reminder planning and duplicate prevention → authorization (cross-user, unauthenticated) → subscription cancellation logic. Unit tests are DB-free; authorization and idempotency tests use a real PostgreSQL (CI service container). No coverage targets.

## 12. Open-source and CI

Public-repository artifacts: README, LICENSE (AGPLv3), CONTRIBUTING (DCO), SECURITY, CODE_OF_CONDUCT, `.env.example`, Dockerfile, `compose.yaml`, self-hosting guide, synthetic demo-data seed, and GitHub Actions (`.github/workflows/ci.yml`: Biome check, typecheck, tests against PostgreSQL, build, DCO check, Docker smoke test, informational `pnpm audit`; `backup-drill.yml`: the restore drill). See [ADR 0001](./decisions/0001-license-agplv3-dco.md) for the licence and [ADR 0009](./decisions/0009-ci-minimal-pinned-secret-free.md) for CI.
