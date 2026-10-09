# card-ledger

Early-stage scaffold (TanStack Start CLI template); no product features yet. Only the Todo demo model, an MCP todo tool, and the Better Auth endpoint exist.

## Stack
- TanStack Start + Router (file-based routes in `src/routes`, generated `src/routeTree.gen.ts` — never edit by hand), React 19 with React Compiler, Vite 8, Nitro server (`npm run build` → `node dist/server/index.mjs`).
- TanStack Query (SSR-integrated in `src/router.tsx`), TanStack Form.
- Prisma 7 + Postgres via `@prisma/adapter-pg`; client generated to `src/generated/prisma` (run `npm run db:generate`; not yet gitignored). Schema: `prisma/schema.prisma`.
- Better Auth (email/password, stateless until a database is wired in): `src/lib/auth.ts`, `src/lib/auth-client.ts`, route `src/routes/api/auth/$.ts`.
- MCP server endpoint at `/mcp` (`src/routes/mcp.ts`, `src/utils/mcp-handler.ts`, `src/mcp-todos.ts`).
- Tailwind CSS 4, shadcn/ui (new-york, zinc, lucide) in `src/components/ui`, Biome for lint/format (tabs, double quotes).
- Typed env via `@t3-oss/env-core` in `src/env.ts` (client vars need `VITE_` prefix).

## Conventions
- Package manager is **npm** (ignore `pnpm dlx` in README/.cursorrules; use `npx shadcn@latest add <component>`).
- Import alias `#/*` → `src/*` (also `@/*` in tsconfig). TypeScript is strict with no unused locals/params.
- DB scripts load `.env.local` (`DATABASE_URL` required; Better Auth needs `BETTER_AUTH_SECRET`).
- Commands: `npm run dev` (port 3000), `npm run check` (Biome), `npm run build`, `npm run db:migrate|push|studio|seed`.
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
