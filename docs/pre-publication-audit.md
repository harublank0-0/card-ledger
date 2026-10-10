# Pre-publication audit

Completed 2026-10-10 against commit `a16e2df` (28 commits, 221 tracked files). It checks that the repository is safe to publish and private by default. Re-run it before pushing to a new remote and before each release; the commands are below.

**Scope.** The committed state (`git archive HEAD`) and the full history. **Not covered:** uncommitted working-tree changes (at the time, the maintainer's own dashboard and navigation work in `docs/database.md`, `src/features/dashboard/*`, `src/routes/_authed.tsx`, `src/test/render.tsx` and `src/components/main-nav*`), and an independent human audit, which has not been done. A model-assisted code and security review was run afterwards against `ef7ff57` and is recorded in [section 8](#8-code-and-security-review) together with what it fixed and what is still open.

## Summary

| Check | Result |
|---|---|
| Secrets in history and in the committed tree | none found |
| Sensitive file names ever committed (env, keys, dumps, backups) | none |
| Real personal data, paths or card-number shapes in the tree | none (see section 1) |
| Ignore rules keep env files and database dumps out of git | fixed during this audit, covered by tests |
| Private by default (MCP, sign-up, ports, secrets, telemetry) | confirmed, each with a test or script check |
| Dependency licences compatible with AGPL-3.0-only | yes, 2 documented exceptions, enforced by the test suite |
| `LICENSE` is the unmodified official AGPL-3.0 text | yes |
| Known vulnerabilities in production dependencies | 4 high advisories, not exploitable here, awaiting an upstream Prisma release |
| Starter leftovers | removed or corrected |
| Code and security review (model-assisted, not an independent audit) | done: 18 findings fixed, remaining items listed in section 8 |

## 1. Secrets and real data

```sh
gitleaks git . --redact --no-banner                   # full history
git archive HEAD | tar -x -C /tmp/tree && gitleaks dir /tmp/tree --redact --no-banner
git log --all --name-only --format= | sort -u | grep -Ei '\.env|secret|\.pem|\.key|\.dump|backup|credential|id_rsa'
git ls-files -ci --exclude-standard                   # tracked files that match an ignore rule
```

- `gitleaks` 8.30.1: no leaks in the full history or in the committed tree.
- File-name scan: only the intended `.env.example`, backup scripts and docs, migration SQL and a workflow named `backup-drill` match; no `.env`, key, certificate, dump or database file was ever committed.
- Content probes on the committed tree:
  - email addresses: only `example.*` and `.test` addresses, the synthetic `demo@card-ledger.test`, and the maintainer's address in `CODE_OF_CONDUCT.md` (published on purpose, and already in every commit's author field);
  - no home-directory paths or account names;
  - the only 13 to 19 digit run is a test asserting that a full card number is rejected;
  - the only database password is the development one in `compose.dev.yaml` and the contributing guide, for a database bound to `127.0.0.1`.
- Binary files: five PNG screenshots in `docs/screenshots/`, each viewed before commit and showing only the synthetic demo account.
- No outbound URLs in application source (`src`, `scripts`, `prisma`).

## 2. Ignore rules

The audit found that `.env.production` and stray `*.dump` files were **not** ignored. `.gitignore` now ignores `.env.*` (except `.env.example`) and `*.dump`, `*.dump.*`, in addition to `backups/`, `*.local`, `.output` and `src/generated`. `src/repo-hygiene.test.ts` asserts this through `git check-ignore`, and `.dockerignore` keeps the same files out of the image build context.

## 3. Private by default

| Property | Evidence |
|---|---|
| `/mcp` does not exist unless `MCP_ENABLED=true`, and still needs a session | `src/mcp-route.test.ts` (route level: 404 unset or false even when signed in, 401 without a session when enabled); `src/env.schema.test.ts` (default false) |
| Registration closes after the first account | `src/lib/signup-policy.test.ts`, `src/env.schema.test.ts` (default `first-user`); second sign-up refused with 403 in the container walk-through |
| The app listens on `127.0.0.1` only; the database publishes no port | `scripts/docker-smoke.sh` (`docker:smoke`, also run by CI) |
| No bootable default secret | `src/env-example.test.ts`; the smoke test rejects an unedited `.env.example` |
| The health endpoint reveals only pass/fail | `src/features/health/health.handler.server.test.ts` |
| Logs carry no amounts, notes or error messages | `src/lib/logger.server.test.ts`; startup check never logs a value (`src/lib/startup-env.server.test.ts`) |
| No telemetry | no outbound URLs in application source; the Prisma CLI's usage ping is disabled in every image stage, in CI and in the npm scripts (`src/telemetry.test.ts`; [ADR 0008](./decisions/0008-container-image-and-compose-topology.md)); the code review found it had been left on in the build stage and CI, which is now fixed; the only runtime connection is an operator-configured SMTP server |
| Session cookies are `Secure` when the public URL is `https://` | verified against the production container (recorded in the roadmap, S-01) |
| Auth secret and server-only code are absent from the client bundle | CI `verify` job step; checked locally on every build |

## 4. Dependency licences

```sh
npm run licenses:check        # also runs as part of `npm test`
```

527 packages in the installed production tree: MIT 441, ISC 35, Apache-2.0 29, BSD-3-Clause 6, MPL-2.0 4, Unlicense 3, BSD-2-Clause 2, and one each of MIT-and-ISC, Python-2.0, CC-BY-4.0, MIT-0 and 0BSD, plus the two exceptions below. There is no GPL-2.0-only, SSPL, non-commercial or proprietary licence.

`scripts/license-policy.ts` is an allowlist: an unrecognised licence fails the check until it is reviewed. Notes on the unusual ones:

- **MPL-2.0** (`lightningcss`, build tooling): file-level copyleft that MPL section 3.3 explicitly allows to be combined with GPL-family licences.
- **CC-BY-4.0** (`caniuse-lite`): browser-support data used at build time, not shipped to users.
- **Python-2.0** (`argparse`): permissive and GPL-compatible.
- **Exception, `elkjs` (EPL-2.0):** a dependency of the Prisma CLI's Studio. It sits in the image's `node_modules` but is never bundled with or linked into the application: aggregation, not a combined work.
- **Exception, `seq-queue` (no `license` field):** it ships an MIT `LICENSE` file; it is pulled in by better-auth through `mysql2`, which Card Ledger does not use.

The licence of the project itself is verified byte-for-byte (ignoring trailing whitespace) against `https://www.gnu.org/licenses/agpl-3.0.txt`, and `package.json` declares `AGPL-3.0-only`.

## 5. Dependency advisories (informational)

```sh
npm audit --omit=dev
```

Four **high** advisories remain, all in transitive packages of the `prisma` CLI:

| Package | Advisory | Why it does not apply here | Fix |
|---|---|---|---|
| `deepmerge-ts` < 8 (via `@prisma/config`) | stack exhaustion merging recursive object graphs | merges the CLI's own configuration, never request data | needs Prisma to move to `deepmerge-ts` 8 |
| `mysql2` < 3.22 (a dependency of `prisma`; also installed as an optional peer of `better-auth` and `db0`) | auth plugin downgrade leaks credentials; compressed-protocol decompression bomb | Card Ledger talks to PostgreSQL only and never opens a MySQL connection | `prisma` pins `mysql2@3.15.3` exactly |

`npm audit fix --force` would downgrade Prisma by a major version, which is not a fix. These were deliberately **not** worked around with `overrides` (patched `mysql2` 3.24 and `deepmerge-ts` 8 exist, but forcing them under the Prisma CLI is untested). Re-check when Prisma publishes a release with updated pins; CI keeps reporting them in the non-blocking `audit` job.

## 6. Starter leftovers

Removed or corrected: the starter README, the `post-cta-init` script (it ran `npx -y create-db@latest`, an external call), the unused `public/prisma.svg`, and pnpm advice in `.cursorrules`. Left in place on purpose: `.cta.json` (scaffold metadata, harmless). The TanStack devtools Vite plugin was **removed** after the code review found that, during `npm run dev`, it listens on `localhost:4206` for unauthenticated cross-origin requests that end in `exec("npm install -D <payload>")`. The router and query panels are now loaded only in development, by dynamic import, from `devDependencies` (see `src/integrations/devtools.tsx`); none of it is in the production bundle or image.

## 7. History and authorship

- 28 commits, all authored by one identity. `Signed-off-by` is present on every commit except the first (`c926759`, the generated scaffold), which predates the DCO policy. CI checks pull request ranges only, so it is unaffected; rewriting the root commit was judged not worth it.
- The author email is public in the history and in `CODE_OF_CONDUCT.md`.

## 8. Code and security review

Four reviewers read the committed code on 2026-10-10 (security and data isolation, domain correctness, infrastructure and supply chain, client code), and every finding that mattered was verified by reproducing it or by reading the code path before it was fixed. Each fix has a test (or, for browser and Docker behaviour, a script check) that failed first and a mutation check that proves it can fail again. This is a model-assisted review, **not an independent human audit**.

**Fixed:**

| Finding | Commit |
|---|---|
| The delete-account password guard could be bypassed with `Content-Type: x/application/json` (reproduced: the account was deleted) | `91981a3` |
| A decimal comma was silently deleted, so `150,00` became 15,000.00 (reproduced) | `1decc5c` |
| The devtools Vite plugin ran an unauthenticated localhost endpoint that ended in a shell command during `npm run dev` | `5b52fa6` |
| The manual restore-test procedure could delete the live database volume or email real users from a restored copy | `99b4cd9` |
| An invalid `DEFAULT_TIMEZONE` aborted the reminder run for every later user and broke pages | `8dbaacc` |
| Reactivating a cancelled subscription kept the cancel end date, so it expired and dropped out of reminders | `cd0b497` |
| The Prisma CLI contacted `checkpoint.prisma.io` at build time, in CI and in dev scripts | `55fdab8` |
| Backup read-back accepted a truncated archive (verified: 1 byte, 100 bytes, 1% short) | `b557a64` |
| `BACKUP_KEEP=00` deleted every backup and still exited 0 | `4f97c91` |
| The DCO check passed a commit with an empty author email | `2f49f96` |
| `.dockerignore` patterns matched only at the root, so nested `.env`, dumps and `backups/` entered the image (reproduced) | `1190b03` |
| The database health check could pass during PostgreSQL's init phase (measured ~0.35 s early) | `061aa69` |
| `restore.sh` took its safety backup before stopping the writers, and a restore interrupted after the drop could not be re-run | `ce759d8` |
| SMTP STARTTLS was opportunistic, so credentials could be downgraded to plaintext | `bf15217` |
| The development console mailer logged recipients and amounts | `1cb14fa` |
| Server functions returned raw internal error messages (hosts, ports, constraint names) to the browser | `e307133` |
| After sign-out and sign-in in one tab, the previous user's cached data rendered for the next user (reproduced) | `b458a1a` |
| Picking a card silently replaced a currency the user had chosen | `e94c715` |

**Checked, no findings:** every server function uses the auth middleware and every query is scoped by `userId`; foreign ids are ownership-checked; refund, statement-overlap and payment races are locked correctly; no float arithmetic on money, and recurrence matched a brute-force reference over 20,000 random cases; no XSS vectors, open redirects, SQL injection or secrets in the client bundle; CSRF protection for server functions is enforced (cross-site, forged-Origin and origin-less requests get 403, verified on a built server); the CI workflows, action pins, lockfile and licence parser.

**Open (reviewed, not fixed yet):**

- Reminders are sent to unverified email addresses when `SIGNUP_MODE=open` and SMTP is configured, so an instance could be used to send reminder-shaped email to a stranger. Single-user (`first-user`) instances are not affected. Needs an email-verification flow.
- Sign-up responses reveal whether an email address is registered, even when sign-up is closed (rate limited).
- Login rate limiting trusts a client-supplied `X-Forwarded-For`; configure trusted proxy headers and document it per proxy.
- There is no request body size limit before parsing; set one in the reverse proxy.
- An unpaid statement on an archived card is shown by the dashboard but not reminded about (a product decision).
- Cancelling a subscription with an end date and then pressing "Save changes" on the same edit page erases that end date.
- Smaller UI items: the transaction date filters are hard to type with a keyboard, there are no custom error or not-found pages, some buttons can be double-clicked, and form errors are not linked to their inputs with `aria-describedby`.
- The default first-billing date of a new subscription uses the runtime's time zone, not the user's.
- A cancel end date before the first billing date reports a database constraint message instead of a clear one.
- A card's currency can change while a statement is being created for it (narrow race).
- Dead starter code: `src/integrations/better-auth/header-user.tsx`, `src/lib/utils.ts` and the `TanstackQueryProvider` stub.

## Known gaps

- **No independent human audit.** The review in section 8 was model-assisted; the open items there remain, and unbounded list reads (the statements list returns every statement; only the transaction list is paginated) and the first-user sign-up race (two simultaneous first sign-ups can both pass the count check, acknowledged in `src/lib/auth.ts`) are known and accepted for single-operator installs.
- The application image is about 1.2 GB.
- The CI workflows have never run on GitHub; they were validated with `actionlint` and by running their steps locally.
- The issue forms and README have not been rendered on GitHub.

## Manual steps on GitHub

These are repository settings and cannot be done from the repository itself.

- [ ] Create `haruBlank0-0/card-ledger` and push (the maintainer's decision; nothing here pushes).
- [ ] Enable **private vulnerability reporting** (Settings, Code security): `SECURITY.md` and the issue chooser point at it.
- [ ] Protect `main`: require pull requests and the `verify`, `dco` and `docker` checks.
- [ ] Create the `bug` and `enhancement` labels the issue forms use.
- [ ] Set the repository description and topics (for example `personal-finance`, `self-hosted`, `subscription-tracker`).
- [ ] After the first run, confirm all three CI jobs and the backup drill are green, and fix whatever the first real run reveals.
- [ ] Optionally enable Dependabot alerts for the Prisma advisories above.
