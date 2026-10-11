# Self-hosting Card Ledger

Card Ledger runs as three containers from one image plus PostgreSQL, started by `docker compose`. It makes no calls to any Card Ledger service and sends no telemetry; the only outbound connection at runtime is the SMTP server you configure, if any.

Design background: [ADR 0008](./decisions/0008-container-image-and-compose-topology.md). Keeping your data safe: [backup and restore](./backup-restore.md).

## What runs

| Service | Role | Reachable from |
|---|---|---|
| `db` | PostgreSQL 17, data in the named volume `card_ledger_db` | other services in this project only (no published port) |
| `migrate` | applies database migrations, then exits | n/a |
| `app` | the web app | `127.0.0.1:3000` on the host (loopback only) |
| `reminders` | runs the reminder email job every hour | n/a |

`app` and `reminders` start only after `migrate` has finished successfully, so a failed migration stops them and shows up as a failed container.

## Requirements

- A Linux, macOS or Windows host with **Docker** and **Docker Compose v2** (this project is tested with Docker 29 and Compose v5).
- About 3 GB of free disk (the application image is roughly 1.2 GB, plus PostgreSQL and build cache) and 1 GB of RAM.
- Internet access **while building** (base images, npm packages, Prisma engines). The running stack needs none, except SMTP if you enable reminders.
- `openssl` (or any other way to generate random strings).

## Install

```sh
git clone https://github.com/haruBlank0-0/card-ledger.git
cd card-ledger
cp .env.example .env
```

Edit `.env` and set the two required secrets. Generate them like this and paste the output:

```sh
openssl rand -hex 24        # POSTGRES_PASSWORD
openssl rand -base64 48     # BETTER_AUTH_SECRET
```

Set `POSTGRES_PASSWORD` before the first start. Use hex: characters such as `/`, `@` or `:` would break the database connection URL. Keep `.env` private and out of version control (it is already git-ignored).

Start everything:

```sh
docker compose up -d --build
docker compose ps
```

Open <http://localhost:3000>. If port 3000 is taken, set `APP_PORT` in `.env`; the default address follows it automatically.

`docker compose up` stops with a message naming the variable if `POSTGRES_PASSWORD` or `BETTER_AUTH_SECRET` is empty; there is no default secret.

## First user

With the default `SIGNUP_MODE=first-user`, the first account to register becomes the owner, and registration then closes. **Create that account before you expose the app to a network.**

| `SIGNUP_MODE` | Who can register |
|---|---|
| `first-user` (default) | only the first account |
| `open` | anyone who can reach the app |
| `closed` | nobody (the sign-up page is hidden) |

Deleting the only account re-opens `first-user` registration. Passwords must be at least 12 characters.

**`open` and email reminders do not mix well.** Card Ledger does not verify email addresses. With `SIGNUP_MODE=open` and an SMTP server configured, anyone who can reach the app can register any address, and the reminder job will email that address, with text the registrant chose (subscription and card names). Use `first-user` (the default) or `closed` whenever you configure SMTP. If you do want an open instance with reminders, for a group you trust, set sending limits at your mail provider and keep the instance off the public internet. The server logs a warning at start-up when it sees this combination; it still starts.

## Email reminders (optional)

Reminders are off until you set an SMTP server in `.env`:

```sh
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM="Card Ledger <ledger@example.com>"
SMTP_SECURE=false   # true for implicit TLS, usually port 465
```

Card Ledger **requires STARTTLS** for any relay that is not on the same machine, so your SMTP password and the reminder text are never sent in the clear; with a relay that offers no encryption the reminder job fails with an error instead of sending. Only if you really use a plaintext relay on a network you trust, set `SMTP_REQUIRE_TLS=false`. A mail catcher on `localhost` needs nothing extra.

Apply it with `docker compose up -d`. The job runs when the stack starts and then every `REMINDER_INTERVAL_SECONDS` (default 3600); each reminder is claimed in the database before it is sent, so repeated runs never send duplicates. Each user chooses their own reminder days and time zone in Settings. Check the job with:

```sh
docker compose logs reminders
```

Reminders go to each account's own sign-up address, which is not verified: read the warning about `SIGNUP_MODE=open` under [First user](#first-user) before combining the two.

Without `SMTP_HOST` each run logs `reminders disabled` and the rest of the app is unaffected. Deliverability (SPF, DKIM, relay limits) is up to your mail provider.

## Reaching it from other devices

The app is published on `127.0.0.1` only, on purpose: sign-in and financial data must not travel over plain HTTP. To use it from other devices, put HTTPS in front of it, then tell the app its public address.

**Reverse proxy** (example with [Caddy](https://caddyserver.com), which obtains certificates itself):

```
ledger.example.com {
	reverse_proxy 127.0.0.1:3000
}
```

Then in `.env`:

```sh
BETTER_AUTH_URL=https://ledger.example.com
```

and run `docker compose up -d`. `BETTER_AUTH_URL` must equal the address in the browser exactly (scheme, host and port). If it does not, sign-in is rejected with `INVALID_ORIGIN`. Session cookies are marked `Secure` only when it starts with `https://`.

**Tailscale** (private access, no public exposure): on the host run `tailscale serve --bg 3000`, then set `BETTER_AUTH_URL` to the `https://<machine>.<tailnet>.ts.net` address it prints.

**SSH tunnel** (single user, nothing to install): `ssh -L 3000:127.0.0.1:3000 your-server`, then browse to <http://localhost:3000> on your own machine.

**Sign-in rate limiting and the client address.** In production Better Auth limits sign-in attempts per client address, and it reads that address from the `X-Forwarded-For` header. It trusts the header only when it holds a single address, so the proxy must *set* it to the address that connected to the proxy, not append to whatever the client sent:

- Caddy's `reverse_proxy` does this by default (it replaces the header for clients it does not trust), so the example above needs nothing more.
- nginx: `proxy_set_header X-Forwarded-For $remote_addr;`. Do not use `$proxy_add_x_forwarded_for`, which appends.
- A header with several addresses is not trusted at all: every such request then shares one budget per endpoint, so rotating a claimed address cannot buy more attempts, but anyone who can reach the app can use up everyone's budget. With no header at all (a tunnel, `docker compose` on one machine) the same shared budget applies, and Better Auth logs a warning saying so. For one person that is the right trade.
- Never publish the app's own port (`3000`) to the internet, because a client could then send any single address it likes and get a fresh budget each time. The compose file binds it to `127.0.0.1` for this reason.

This is checked by `src/lib/rate-limit.integration.test.ts` against the real handler; how your proxy builds the header is not.

**Request size.** The application does not cap request bodies itself. Put a limit at the proxy, for example in Caddy `request_body { max_size 1MB }` inside the site block, or nginx `client_max_body_size 1m;`. Nothing in this application needs more than a few kilobytes per request.

The proxy, Tailscale and tunnel examples above are standard configurations, not something this repository tests.

## Upgrade

```sh
sh scripts/backup.sh               # 1. back up first (docs/backup-restore.md)
git pull
docker compose up -d --build
docker compose logs migrate        # shows the migrations that were applied
curl -fsS http://127.0.0.1:3000/api/health
```

Migrations only move forward. To go back to an older version, restore the backup you took before upgrading.

## Health and logs

- `GET /api/health` returns `200 {"status":"ok"}` when the database answers and every migration is applied, otherwise `503` with a pass/fail result per check. It reveals nothing else and is what the compose health check uses.
- `docker compose logs -f app` shows one JSON object per line. The application's own log lines carry only fixed messages and counts, never amounts, notes or descriptions.

## Stopping and removing

```sh
docker compose down        # stops everything; your data stays in the volume
docker compose down -v     # also DELETES the database volume; there is no undo
```

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `docker compose up` stops with "Set POSTGRES_PASSWORD in .env" (or `BETTER_AUTH_SECRET`) | The variable is empty or `.env` is missing. Fill it in. |
| `app` exits at once and its log shows `invalid environment variable` | The log names each wrong variable and the rule it broke (never the value). Fix `.env`, then `docker compose up -d`. |
| `app` is `unhealthy` | `docker compose logs migrate app`. Then `curl http://127.0.0.1:3000/api/health`: `migrations: pending` or `fail` means a migration did not finish; `database: fail` means PostgreSQL is not answering. |
| Sign-in fails with 403 / `INVALID_ORIGIN` | `BETTER_AUTH_URL` does not match the address in the browser. Match scheme, host and port exactly. |
| "Sign-up is disabled on this instance" | An account already exists (`first-user`) or `SIGNUP_MODE=closed`. Sign in, or change the mode. |
| `port is already allocated` | Another program uses the port. Set `APP_PORT` in `.env`. |
| No reminder emails | `SMTP_HOST` is not set or the server rejects the login. Read `docker compose logs reminders`. |
| `app` logs a warning about `SIGNUP_MODE=open` with an SMTP server | Open sign-up and email reminders are both on, and addresses are not verified, so anyone can have reminders sent to any address. Set `SIGNUP_MODE=first-user` or `closed`, or accept it for a trusted group (see [First user](#first-user)). The app still starts. |
| Changed `POSTGRES_PASSWORD` and now nothing connects | PostgreSQL only reads that variable when the volume is first created. Either change it back, or set the database password to match: `docker compose exec db psql -U cardledger -c "ALTER USER cardledger PASSWORD 'new-value'"`. |

## Your data

Everything lives in the `card_ledger_db` volume. Every signed-in user can export their data as JSON or CSV and delete their account from Settings. A database backup contains all users' financial data, so treat it like the live database. See [backup and restore](./backup-restore.md).
