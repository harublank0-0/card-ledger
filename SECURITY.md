# Security policy

Card Ledger holds personal financial information, so security reports are welcome and taken seriously. Please report vulnerabilities privately, as described below.

## Supported versions

Card Ledger is pre-1.0. Security fixes are made on `main`, so only the **latest commit on `main`** (and the most recent release, once releases exist) is supported. Self-hosters upgrade with the procedure in [docs/self-hosting.md](./docs/self-hosting.md#upgrade).

## Reporting a vulnerability

**Do not open a public issue, discussion or pull request for a vulnerability.**

Use GitHub's private vulnerability reporting:

> <https://github.com/haruBlank0-0/card-ledger/security/advisories/new>

If you cannot use the form, open a public issue titled "Security contact request" with **no details**, and a maintainer will arrange a private channel.

Please include:

- what is affected (feature, endpoint or script) and the commit or version you tested;
- how you run it (the compose stack or `pnpm run dev`) and anything unusual about the setup;
- steps to reproduce, the impact you expect, and a suggested fix if you have one.

Please **do not include real financial data, backups, `.env` files, session tokens or other people's information.** Reproduce with the synthetic demo account (`pnpm run db:seed`) or data you created yourself.

## What to expect

Card Ledger is maintained by volunteers, so these are targets, not guarantees:

- acknowledgement within **7 days**;
- an initial assessment within **14 days**;
- progress updates at least every **30 days** until the report is resolved;
- a fix released together with a published advisory, crediting you if you wish.

Critical issues (for example access to another user's data) are prioritised over everything else.

## Scope

In scope:

- the application code in this repository, including authentication, sessions, per-user data isolation, data export and account deletion;
- the Docker image and compose files, the backup and restore scripts, and the CI configuration;
- secrets, financial data or personal data leaking through logs, the image, the client bundle or API responses;
- documentation that would lead an operator into an insecure setup.

Out of scope:

- an operator choosing to expose the app or database over plain HTTP or a public interface, or using a weak `POSTGRES_PASSWORD` or `BETTER_AUTH_SECRET`;
- vulnerabilities in a dependency that cannot be exploited through Card Ledger (please report those upstream; tell us if you can exploit one here);
- denial of service by sheer request volume against a small self-hosted instance;
- social engineering, and attacks that need physical access to the server.

## Safe harbour

If you act in good faith we will not pursue or support legal action against you. That means: test only against your own instance, do not access, change or delete other people's data, do not degrade a service you do not own, report promptly, and give us reasonable time to fix the problem before disclosing it.

## How the application protects data

- Every domain row belongs to a user and every query is user-scoped; each feature has cross-user and unauthenticated tests. See [ADR 0003](./docs/decisions/0003-user-scoped-data-isolation.md).
- Only the last four digits of a card are stored; there are no card numbers, CVV, PIN or banking credentials.
- No telemetry and no calls to external services other than an operator-configured SMTP server.
- The `/mcp` endpoint is off by default and requires a session when enabled; the health endpoint reveals only pass/fail.
- The full model is in [docs/architecture.md](./docs/architecture.md#10-security-model). Operator hardening (HTTPS, private access, backups) is in [docs/self-hosting.md](./docs/self-hosting.md) and [docs/backup-restore.md](./docs/backup-restore.md).
