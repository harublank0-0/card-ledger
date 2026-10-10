# card-ledger

Open-source (AGPLv3), self-hostable personal finance and subscription tracker. Working MVP: sign-in, cards (last4 only), subscriptions, email reminders, transactions with refunds, card statements and payments, and a dashboard home page. Data export, account deletion, demo data, the Docker/compose stack, the self-hosting guide (`docs/self-hosting.md`) and backup/restore (`docs/backup-restore.md`) are built, as are the real `README.md` (screenshots of the demo data in `docs/screenshots/`), `CONTRIBUTING.md`, `SECURITY.md` and `CODE_OF_CONDUCT.md`; CI, issue/PR templates and the pre-publication audit are not (see `docs/roadmap.md` Progress). The public repository is planned as `github.com/haruBlank0-0/card-ledger` and does not exist yet.

Planning docs (proposed, not yet implemented): `docs/architecture.md`, `docs/database.md`, `docs/roadmap.md`, `docs/decisions/`. Work one roadmap ticket at a time; read the relevant doc sections first and update docs when a decision changes.

## Product principles
- One codebase for self-hosted and any future cloud; no feature locks, license checks, or edition flags.
- No telemetry and no required calls to external services; email (SMTP) is optional and operator-configured.
- Never store full card numbers, CVV, PIN, or banking credentials (`last4` only). Never commit secrets or real financial data; demo data is synthetic.
- Every domain row has `userId`; every query is user-scoped; enforce auth in server functions/middleware, not only route guards; each feature needs cross-user and unauthenticated tests.
- Money = integer minor units + ISO 4217 currency, never floats, never summed across currencies. Date-only deadlines are calendar dates (`@db.Date`); timestamps are UTC.
- Validate input on the server with `.validator()` + Zod. Keep financial logic in pure modules (no React/Prisma).

## Stack
- TanStack Start + Router (file-based routes in `src/routes`, generated `src/routeTree.gen.ts` — never edit by hand), React 19 with React Compiler, Vite 8, Nitro server (`npm run build` → `node .output/server/index.mjs`).
- TanStack Query (SSR-integrated in `src/router.tsx`), TanStack Form.
- Prisma 7 + Postgres via `@prisma/adapter-pg`; client generated to `src/generated/prisma` (gitignored; run `npm run db:generate`). Schema: `prisma/schema.prisma`.
- Better Auth (email/password, persisted via the Prisma adapter, `SIGNUP_MODE` policy): `src/lib/auth.ts`, `src/lib/auth-client.ts`, route `src/routes/api/auth/$.ts`.
- MCP endpoint `/mcp` is disabled (404) unless `MCP_ENABLED=true` and then requires a session; no tools registered yet.
- `/api/health` is deliberately unauthenticated (200, or 503 with pass/fail per check only) for Docker and proxies; it touches no domain table. A Nitro plugin (`src/server/startup.ts`) validates the environment at boot and logs variable names only. Server logs are JSON lines from `src/lib/logger.server.ts`: primitives only, never amounts, notes or error messages (use `errorClass`).
- Features live in `src/features/<name>/` (`*.schemas.ts` Zod, `*.service.server.ts` user-scoped Prisma, `*.functions.ts` `createServerFn` + `authMiddleware`, `*.logic.ts` pure). Routes in `src/routes/_authed/` are guarded for UX only; `/` is the dashboard. Component render tests use `src/test/render.tsx` (in-memory router, static HTML, no DOM library).
- Tailwind CSS 4, shadcn/ui (new-york, zinc, lucide) in `src/components/ui`, Biome for lint/format (tabs, double quotes).
- Typed env via `@t3-oss/env-core` in `src/env.ts` (client vars need `VITE_` prefix).

## Conventions
- Package manager is **npm** (ignore `pnpm dlx` in README/.cursorrules; use `npx shadcn@latest add <component>`).
- Import alias `#/*` → `src/*` (also `@/*` in tsconfig). TypeScript is strict with no unused locals/params.
- DB scripts load `.env.local` (`DATABASE_URL` required; Better Auth needs `BETTER_AUTH_SECRET`).
- Local services: `docker compose -f compose.dev.yaml up -d` (Postgres on 127.0.0.1:5434; Mailpit SMTP 127.0.0.1:1025, inbox http://localhost:8025). Reminders: `npm run reminders:send`. After changing `prisma/schema.prisma`, run `npm run db:migrate` and **restart `npm run dev`** (it caches the old Prisma client). `.env.local` needs `DATABASE_URL`, `BETTER_AUTH_URL=http://localhost:3100`, `BETTER_AUTH_SECRET` (32+ chars).
- Self-hosting: `compose.yaml` runs `db`, a one-shot `migrate`, `app` and `reminders` from one `Dockerfile` image ([ADR 0008](docs/decisions/0008-container-image-and-compose-topology.md)); it needs `POSTGRES_PASSWORD` and `BETTER_AUTH_SECRET` in `.env` (template: `.env.example`, kept in sync with `src/env.schema.ts` and `compose.yaml` by a test; its project name is `card-ledger-selfhost` so it never touches the dev stack), publishes the app on 127.0.0.1 only and never publishes the database. `npm run docker:smoke` builds it in a throwaway project and checks health, no DB port, loopback-only, non-root and restart persistence (needs Docker). `BETTER_AUTH_URL` must equal the public URL exactly; cookies are `Secure` only when it is `https://`.
- Backups: `npm run backup` (`scripts/backup.sh`, `pg_dump` via the `db` container into git-ignored `backups/`, `BACKUP_KEEP`), `scripts/restore.sh <file> [--force]`, and `npm run backup:drill` (throwaway project; run it after touching `scripts/`). Backups hold all users' financial data: never commit or log them.
- Commands: `npm run dev` (port 3100, strict), `npm run check` (Biome), `npm run typecheck`, `npm test` (Vitest; integration tests auto-create `<db>_test`), `npm run build`, `npm run db:migrate|studio|seed`. `npm run db:seed` creates the synthetic demo account (prints a one-time password; refuses `NODE_ENV=production`). Exports are at `/api/export/json` and `/api/export/csv/<entity>` (format: `docs/data-format.md`).
- Biome ignores `src/routeTree.gen.ts` and `src/styles.css`.

<!-- intent-skills:start -->
## Skill Loading

Use the repository’s installed Intent. If it is unavailable, report the missing dependency instead of downloading a replacement.
Before editing files for a substantial task:
- Run `npm exec --no -- intent list` from the workspace root to see available local skills.
- If a listed skill matches the task, run `npm exec --no -- intent load <package>#<skill>` before changing files.
- Use the loaded `SKILL.md` guidance while making the change.
- Monorepos: when working across packages, run the skill check from the workspace root and prefer the local skill for the package being changed.
- Multiple matches: prefer the most specific local skill for the package or concern you are changing; load additional skills only when the task spans multiple packages or concerns.
<!-- intent-skills:end -->
