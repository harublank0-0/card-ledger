# Contributing to Card Ledger

Thanks for helping. Card Ledger is an open-source, self-hostable personal finance and subscription tracker. This guide covers setting up, the working rules, and what a pull request needs.

By taking part you agree to follow the [Code of Conduct](./CODE_OF_CONDUCT.md). To report a vulnerability, read [SECURITY.md](./SECURITY.md) first and do not open a public issue.

## Ways to help

- Report a bug or suggest a feature with an issue (never paste real financial data).
- Improve the documentation in [`docs/`](./docs).
- Pick up an item from the [roadmap](./docs/roadmap.md). Open an issue first for anything larger than a small fix, so the approach can be agreed before you invest time.

## Licence of contributions

Card Ledger is licensed under the **GNU Affero General Public License v3.0 only** (`AGPL-3.0-only`, see [LICENSE](./LICENSE)).

By contributing you agree that your contribution is licensed under the same license (inbound = outbound). There is **no CLA**. Because of that, contributed code cannot later be relicensed (for example into a proprietary edition) without the consent of every contributor. This is intentional.

If you run a modified version of Card Ledger as a network service (including a hosted service), AGPL section 13 requires you to offer your users the source of your modified version.

## Set up a development environment

You need Node.js 24, npm and Docker.

```bash
git clone https://github.com/haruBlank0-0/card-ledger.git
cd card-ledger
npm ci
docker compose -f compose.dev.yaml up -d   # PostgreSQL on 127.0.0.1:5434 and a mail catcher (Mailpit)
```

Create `.env.local` (it is git-ignored):

```bash
DATABASE_URL=postgresql://cardledger:cardledger_dev@127.0.0.1:5434/cardledger
BETTER_AUTH_URL=http://localhost:3100
BETTER_AUTH_SECRET=<at least 32 random characters, for example: openssl rand -base64 48>
# Optional: send reminder emails to the local Mailpit inbox (http://localhost:8025)
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
```

Then:

```bash
npm run db:generate   # generates the Prisma client into src/generated (git-ignored)
npm run db:migrate    # applies migrations to your development database
npm run db:seed       # optional: synthetic demo account (prints a one-time password)
npm run dev           # http://localhost:3100
```

After changing `prisma/schema.prisma`, run `npm run db:migrate` and restart `npm run dev`. The test suite creates and migrates its own `<database>_test` database on the same server, so it never touches your development data.

The stack, directory layout and conventions are described in [AGENTS.md](./AGENTS.md) and [docs/architecture.md](./docs/architecture.md); the data model in [docs/database.md](./docs/database.md).

## Working on a change

- Keep changes small and focused on **one roadmap ticket** or one fix.
- Use a short branch name such as `feat/s-05-short-name`, `fix/refund-rounding` or `docs/self-hosting-typo`.
- Keep the pure financial logic (money, dates, recurrence, reminders, statement balances) in `*.logic.ts` files with no React and no Prisma imports.
- Update the docs your change touches: the progress table in [docs/roadmap.md](./docs/roadmap.md) and, when a decision changes, an ADR in [docs/decisions/](./docs/decisions). Never edit `src/routeTree.gen.ts` by hand.

### Tests

Write the test first and watch it fail for the right reason.

- Money, calendar-date, recurrence and reminder logic needs unit tests, including edge cases (month ends, leap years, time zones, rounding).
- Anything that reads or writes user data needs an **unauthenticated** test and a **cross-user** test (user B cannot see or change user A's record).
- Before you call something done, break it on purpose (remove a `userId` scope, a guard or a money rule) and check that a test fails. Restore it afterwards.
- Run `npm run docker:smoke` when you touch `Dockerfile`, `compose.yaml` or anything that runs in the container, and `npm run backup:drill` when you touch the backup or restore scripts. Both need Docker.

### Before opening a pull request

```bash
npm run check       # Biome lint + format
npm run typecheck
npm test            # needs the development database to be running
npm run build
```

### Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`. Keep the subject short and explain the why in the body.

### Sign your commits (DCO)

Every commit must carry a `Signed-off-by` line certifying the [Developer Certificate of Origin](https://developercertificate.org/): that you wrote the change, or otherwise have the right to submit it under the project license. The sign-off email must match the commit's author email.

```bash
git commit -s -m "feat: add something"
```

`-s` appends `Signed-off-by: Your Name <you@example.com>` using your `git config user.name` and `user.email`. Forgot it? Run `git commit --amend -s` for the last commit, or `git rebase --signoff <base>` for a series, then force-push your branch.

## Dependencies

Do not add a dependency without saying why in the pull request. A new dependency must:

- have a licence compatible with `AGPL-3.0-only` (permissive licences such as MIT, ISC, BSD and Apache-2.0 are fine; GPL-2.0-only, SSPL and non-commercial licences are not);
- not send telemetry or call external services;
- be maintained and proportionate to the problem it solves (we ship it to every self-hoster).

## Hard rules

- **Never** store full card numbers, CVV, PIN, or banking credentials. Only the last four digits.
- **Never** commit secrets, `.env` files, database backups, or real financial records. Use synthetic data in examples, tests, and screenshots.
- No telemetry, analytics, or calls to external services from the application, other than the operator-configured SMTP server.
- Every query is scoped to the signed-in user, and authorization is enforced on the server (not only in route guards).
- Money is integer minor units plus a currency code, never floats and never summed across currencies.

## Reporting security issues

Please do not open a public issue for vulnerabilities. Follow [SECURITY.md](./SECURITY.md).
