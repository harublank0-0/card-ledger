# 0008 — Container image and compose topology

Status: Proposed

## Context
Self-hosting must work from a fresh clone with `docker compose up`, without publishing the database, without telemetry, and with the same image any future managed cloud would run ([ADR 0002](./0002-single-codebase-env-driven-deployments.md)).

## Decision
- **One image, three roles.** A single multi-stage `Dockerfile` builds the app. `compose.yaml` runs it as `app` (the Nitro server), `migrate` (one-shot `prisma migrate deploy`) and `reminders` (the job from [ADR 0006](./0006-reminder-job-standalone-cron.md) in a sleep loop). The image defines no `HEALTHCHECK`; only `app` has one, in compose, because the same image runs commands that are not servers.
- **Migrations are a one-shot service**, not an entrypoint step. `app` and `reminders` wait for it with `service_completed_successfully`, so replicas never race to migrate and a failed migration is a visible failed container that blocks start. Operators not using compose run the same command themselves.
- **Debian slim base** (`node:24-bookworm-slim`, matching development) rather than Alpine, to avoid musl surprises with Prisma's native schema engine.
- **The runtime image keeps `src/`, `scripts/`, `prisma/` and production `node_modules`** next to the built `.output`, because the reminder job runs from source under `tsx` and `prisma migrate deploy` needs the CLI. `tsx` therefore moved from `devDependencies` to `dependencies`.
- **No secrets in the image.** Everything comes from the environment at runtime. `.dockerignore` excludes `.env*`, `.git` and generated output. The only build-time value is a placeholder `DATABASE_URL`, needed because `prisma.config.ts` requires one even for `prisma generate`; nothing connects to it.
- **No telemetry from tooling.** `CHECKPOINT_DISABLE=1` and `PRISMA_HIDE_UPDATE_MESSAGE=1` stop the Prisma CLI's update checks at runtime. Network access is needed only at build time (base image, npm packages, Prisma engines).
- **Private by default.** The `db` service has no `ports:`; the app is published on `127.0.0.1` only (`APP_PORT`, default 3000). Exposure beyond the host is the operator's explicit step (reverse proxy with HTTPS, or Tailscale). `no-new-privileges` is set and all capabilities are dropped for the three app-image services; containers run as the non-root `node` user.
- **Its own compose project name** (`card-ledger-selfhost`). `compose.dev.yaml` has no name, so Compose calls that project after the checkout directory (`card-ledger`); both files define a `db` service, and sharing a project would let one stack recreate the other's database container. A test enforces the difference.
- **Required settings fail loudly.** `POSTGRES_PASSWORD` and `BETTER_AUTH_SECRET` use `${VAR:?message}`, so `docker compose up` without them stops and names the variable. No default secret exists.

## Alternatives
- Migrate in the container entrypoint: simpler, but races with multiple replicas and hides failures inside a crash-looping app.
- Alpine base: smaller, with a higher risk of native-binary problems.
- A host cron job for reminders: documented as an option, but a compose loop keeps `docker compose up` complete.
- A separate, slimmer reminder image (bundled script): rejected for now; one image keeps the deployment model simple.

## Consequences
- The image is large (about 1.2 GB) because it carries full production `node_modules` for the reminder job and Prisma CLI. Bundling the job into a single file and trimming dependencies is a known follow-up.
- Cookies are `Secure` only when `BETTER_AUTH_URL` is `https://` (verified in the production container); behind an HTTPS proxy `BETTER_AUTH_URL` must equal the public URL exactly, or sign-in is rejected with `INVALID_ORIGIN`.
- `scripts/docker-smoke.sh` (`npm run docker:smoke`) checks these properties and is the basis for the CI smoke test in O-03.
