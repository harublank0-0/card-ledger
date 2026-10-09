# Contributing to Card Ledger

Thanks for helping. Card Ledger is an open-source, self-hostable personal finance and subscription tracker. This is the short version of the rules; a fuller guide arrives with ticket O-02.

## License of contributions

Card Ledger is licensed under the **GNU Affero General Public License v3.0 only** (`AGPL-3.0-only`, see [LICENSE](./LICENSE)).

By contributing you agree that your contribution is licensed under the same license (inbound = outbound). There is **no CLA**. Because of that, contributed code cannot later be relicensed (for example into a proprietary edition) without the consent of every contributor. This is intentional.

If you run a modified version of Card Ledger as a network service (including a hosted service), AGPL section 13 requires you to offer your users the source of your modified version.

## Sign your commits (DCO)

Every commit must carry a `Signed-off-by` line certifying the [Developer Certificate of Origin](https://developercertificate.org/): that you wrote the change, or otherwise have the right to submit it under the project license.

```bash
git commit -s -m "feat: add something"
```

`-s` appends `Signed-off-by: Your Name <you@example.com>` using your `git config user.name` and `user.email`. Forgot it? Run `git commit --amend -s` for the last commit, or `git rebase --signoff` for a series.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`. Keep the subject short and explain the why in the body.

## Before opening a pull request

```bash
npm run check       # Biome lint + format
npm run typecheck
npm test            # needs the dev database: docker compose -f compose.dev.yaml up -d
```

- Keep changes small and focused on one roadmap ticket (see [docs/roadmap.md](./docs/roadmap.md)).
- Add or update tests. Financial logic (money, dates, renewals) needs unit tests; anything touching user data needs cross-user access tests.
- Do not add dependencies without saying why in the PR.

## Hard rules

- **Never** store full card numbers, CVV, PIN, or banking credentials. Only the last four digits.
- **Never** commit secrets, `.env` files, or real financial records. Use synthetic data in examples, tests, and screenshots.
- No telemetry, analytics, or calls to external services from the application, other than the operator-configured SMTP server.

## Reporting security issues

Please do not open a public issue for vulnerabilities. A `SECURITY.md` with a private reporting channel is planned (ticket O-02); until it exists, contact the maintainer directly.
