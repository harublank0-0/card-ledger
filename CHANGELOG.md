# Changelog

All notable changes are listed here, newest first. Card Ledger is pre-1.0: anything may change
between 0.x releases, and every release says what to do when upgrading.

## 0.1.1 — 2026-10-12

A packaging and documentation release. **The application, its database schema and its
dependencies are the same as in 0.1.0**: there is nothing to migrate and no reason to upgrade
unless you want the prebuilt image below. Card Ledger is still pre-1.0 and has **not had an
independent security audit**; read the known limitations before running it.

### Added

- **A prebuilt container image**, `ghcr.io/haruBlank0-0/card-ledger:0.1.1`, for `linux/amd64` and
  `linux/arm64` (Apple silicon and other ARM machines as well as x86 hosts). CI builds each
  architecture on a native runner from the tagged commit, runs the stack's 13-check smoke test on
  that exact image, and only then pushes it. The tags are the full version and its minor line
  (`0.1`). There is no `latest` tag: migrations only move forward, so an upgrade should always be
  your choice.
- **Run it without building**: set `CARD_LEDGER_IMAGE` in `.env`, then
  `docker compose pull && docker compose up -d --no-build`. The self-hosting guide has the steps
  ("Use the prebuilt image"); building from source (`docker compose up -d --build`) is unchanged.
- **Labels that say where an image came from**: the source repository, commit, version and licence
  are OCI labels, so `docker image inspect` shows the commit the image was built from.
- **A maintainer's release guide** (`docs/releasing.md`): the order of a release, the command that
  turns a changelog section into a release body (a test runs it), and the mistakes the order
  avoids.
- **An image check on pull requests** that change what goes into the image: both architectures are
  built and smoke-tested without any registry access.

### Upgrading from 0.1.0

Nothing is required. To move to the prebuilt image, take a backup as you would before any change,
set `CARD_LEDGER_IMAGE=ghcr.io/haruBlank0-0/card-ledger:0.1.1` in `.env`, then run
`docker compose pull` and `docker compose up -d --no-build`. The `migrate` service finds nothing
to apply.

### Install

You need Docker with Compose v2.

```sh
git clone https://github.com/haruBlank0-0/card-ledger.git
cd card-ledger
cp .env.example .env     # set POSTGRES_PASSWORD and BETTER_AUTH_SECRET (the guide shows how)
docker compose up -d --build
curl -fsS http://localhost:3000/api/health    # must print {"status":"ok"}
```

Or skip the build and run the published image, as described above. The full guide, including
HTTPS, email, upgrades and troubleshooting, is [docs/self-hosting.md](./docs/self-hosting.md), and
[backups](./docs/backup-restore.md) should be set up before you rely on it.

### How it was checked

- The same automated test suite as 0.1.0 runs in CI on every pull request, together with the lint
  and format check, type check, build, licence check, dependency audit and the Docker smoke test
  of the whole stack; the backup and restore drill passes in CI.
- The new publishing pipeline was exercised on GitHub before this release: both architectures were
  built and smoke-tested on their native runners on the pull request that introduced it, and the
  manifest-merge commands were run against a local registry. The first push to the registry is
  this release.
- The review behind 0.1.0 was model-assisted and is **not** an independent audit; what was checked,
  and what was not, is recorded in
  [docs/pre-publication-audit.md](./docs/pre-publication-audit.md).

### Known limitations

Unchanged from 0.1.0, plus one new item. Please read these before running it.

- **Not independently audited.** The review was done with a model's help. A financial application
  deserves a human audit; treat this as unaudited software and keep it off the public internet
  unless you have reviewed it yourself.
- **Reminders can go to unverified addresses.** Email addresses are not verified. With
  `SIGNUP_MODE=open` and SMTP configured, anyone who can reach the app can register any address and
  have reminders emailed to it. The server logs a warning at start-up when it sees this
  combination. Use `first-user` or `closed` when you configure SMTP.
- **Unbounded lists.** The statements list returns every statement; only the transaction list is
  paginated. Fine for one person's data, not for a very large account.
- **Deleting the only account re-opens first-user registration**, until someone creates a new one.
- **Restores are tested on PostgreSQL 17 only.** Restoring across PostgreSQL major versions has
  not been tried.
- **Untested deployment examples.** The guide's HTTPS reverse proxy (Caddy, nginx), Tailscale, SSH
  tunnel, cron and systemd backup schedules and `age` encryption snippets have not been run by any
  test, and the stack has not been installed on a clean VPS, on Linux or Windows hosts by hand, or
  against a real SMTP relay.
- **The image is not signed.** It carries OCI labels, but there is no signature or SBOM
  attestation yet, and the base image is a moving tag rebuilt on each release. Check the commit
  label against the release if that matters to you.
- **Size.** The application image is roughly 1.1 to 1.2 GB.

### Reporting problems

Report security issues privately through GitHub's private vulnerability reporting, as described in
[SECURITY.md](./SECURITY.md); please do not open a public issue for them. For everything else open
an issue, and never paste real financial data, backups or `.env` files into one.

### Licence

[AGPL-3.0-only](./LICENSE). Contributions need a DCO sign-off (`git commit -s`) and there is no
CLA; see [CONTRIBUTING.md](./CONTRIBUTING.md).

## 0.1.0 — first public release (2026-10-12)

Card Ledger is a self-hostable personal finance and subscription tracker: your cards,
subscriptions, spending, card statements and due dates in one place, with email reminders, on a
server you control. This is a **pre-1.0 release that has not had an independent security audit**.
Run it for yourself, keep it private, and read [SECURITY.md](./SECURITY.md) before exposing it to
the internet.

### What is in it

- **Cards** (last four digits only, currency, limit, statement and due days; archive instead of
  delete).
- **Subscriptions** with weekly, monthly, quarterly, yearly or every-N-units renewals, month-end
  safe dates, cancel and reactivate, expiry and cancel-by deadlines, and the monthly commitment
  per currency.
- **Transactions** with categories, partial or full refunds, shareable filters and totals per
  currency.
- **Card statements and payments**: what you owe the bank, overdue state and overpayment credit.
  Payments are not counted as spending.
- **Dashboard** for any month: spending per currency, subscription commitment, amounts owed, a
  30-day look-ahead and spending by category.
- **Email reminders** through your own SMTP server (optional): one digest per person per run, no
  duplicates.
- **Your data**: export everything as JSON or CSV, delete your account, back up the database, and
  load a synthetic demo account to look around.
- **Self-hosting** with Docker Compose: PostgreSQL, a one-shot migration job, the app and the
  reminder job from one image. The app is published on `127.0.0.1` only, the database on no port
  at all, and `/api/health` reports readiness. Backup and restore scripts come with a restore
  drill, and the guide covers upgrades.
- **Privacy by construction**: no telemetry, no calls to any Card Ledger service, no bank
  connections, no full card numbers, CVV or credentials, and every row and query scoped to the
  signed-in user. Money is stored as integer minor units with a currency and is never summed
  across currencies.
- **Sign-up policy**: `first-user` (default; the first account becomes the owner and registration
  closes, even if several people try at the same moment), `open` or `closed`.
- **Request size limit**: the application itself refuses request bodies over 1 MiB with HTTP 413.
  A limit at your reverse proxy is still good practice.

### Install

You need Docker with Compose v2.

```sh
git clone https://github.com/haruBlank0-0/card-ledger.git
cd card-ledger
cp .env.example .env     # set POSTGRES_PASSWORD and BETTER_AUTH_SECRET (the guide shows how)
docker compose up -d --build
curl -fsS http://localhost:3000/api/health    # must print {"status":"ok"}
```

Then open <http://localhost:3000> and create the first account. The full guide, including HTTPS,
email, upgrades and troubleshooting, is [docs/self-hosting.md](./docs/self-hosting.md). Set up
[backups](./docs/backup-restore.md) before you rely on it. This is the first release, so there
is nothing to upgrade from; later releases will say what to do, and migrations only move forward,
so take a backup first.

### How it was checked

- An automated test suite, including integration tests against a real PostgreSQL and cross-user
  and unauthenticated tests for the features that touch user data, runs in CI on every pull
  request together with a lint and format check, a type check, a build, a licence check against an
  AGPL-3.0-only allowlist, a dependency audit, and a Docker smoke test of the whole stack.
- The backup and restore procedure has a drill that destroys a database and restores it from a
  backup; it passes in CI.
- A fresh clone was installed following the guide on macOS (Apple silicon, Docker 29) and used
  through a real browser: sign-up, the main pages, sign-out and sign-in, then backup, restore test
  and the upgrade steps.
- A model-assisted code and security review was run before publication and its findings were fixed
  with tests (the audit lists 40 fixed findings; one item remains open and is listed below). It is
  **not** an independent audit. What was checked, and what was not, is recorded in
  [docs/pre-publication-audit.md](./docs/pre-publication-audit.md).

### Known limitations

Please read these before running it.

- **Not independently audited.** The review above was done with a model's help. A financial
  application deserves a human audit; treat this as unaudited software and keep it off the public
  internet unless you have reviewed it yourself.
- **Reminders can go to unverified addresses.** Email addresses are not verified. With
  `SIGNUP_MODE=open` and SMTP configured, anyone who can reach the app can register any address and
  have reminders emailed to it. The server logs a warning at start-up when it sees this
  combination. Use `first-user` or `closed` when you configure SMTP.
- **Unbounded lists.** The statements list returns every statement; only the transaction list is
  paginated. Fine for one person's data, not for a very large account.
- **Deleting the only account re-opens first-user registration**, until someone creates a new one.
- **Restores are tested on PostgreSQL 17 only.** Restoring across PostgreSQL major versions has
  not been tried.
- **Untested deployment examples.** The guide's HTTPS reverse proxy (Caddy, nginx), Tailscale, SSH
  tunnel, cron and systemd backup schedules and `age` encryption snippets have not been run by any
  test, and the stack has not been installed on a clean VPS, on Linux or Windows hosts by hand, or
  against a real SMTP relay. CI runs the Docker smoke test on Linux x86-64.
- **Size.** The application image is roughly 1.1 to 1.2 GB.

### Not included

Bank connections or statement import, currency conversion, mobile apps, organisations or
shared ledgers, and notification channels other than email. A `/mcp` endpoint exists but is
disabled unless `MCP_ENABLED=true`, and it registers no tools yet. Candidates for later releases
are listed in [docs/roadmap.md](./docs/roadmap.md) and will be prioritised from real feedback.

### Reporting problems

Report security issues privately through GitHub's private vulnerability reporting, as described in
[SECURITY.md](./SECURITY.md); please do not open a public issue for them. For everything else open
an issue, and never paste real financial data, backups or `.env` files into one.

### Licence

[AGPL-3.0-only](./LICENSE). Contributions need a DCO sign-off (`git commit -s`) and there is no
CLA; see [CONTRIBUTING.md](./CONTRIBUTING.md). If you run a modified version as a network service,
AGPL section 13 requires you to offer its source to your users.
