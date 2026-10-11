## What and why

<!-- What does this change, and why? Link the roadmap ticket (docs/roadmap.md) or issue. -->

## How it was tested

- [ ] Tests added or updated. Logic for money, dates, recurrence or reminders has unit tests; anything touching user data has unauthenticated and cross-user tests.
- [ ] `pnpm run check`, `pnpm run typecheck`, `pnpm test` and `pnpm run build` pass locally.
- [ ] If this touches the Dockerfile, compose files or backup scripts: `pnpm run docker:smoke` / `pnpm run backup:drill` pass.

## Checklist

- [ ] Every commit is signed off (`git commit -s`, see CONTRIBUTING.md): the DCO check requires it.
- [ ] No secrets, `.env` files, backups or real financial data. Fixtures, examples and screenshots are synthetic.
- [ ] Every query is scoped to the signed-in user; money is integer minor units and is never summed across currencies.
- [ ] No telemetry and no new calls to external services.
- [ ] Docs updated: the progress table in `docs/roadmap.md`, and an ADR in `docs/decisions/` if a decision changed.
- [ ] No new dependency, or it is justified below and its licence is compatible with AGPL-3.0-only.

## New dependencies

<!-- Name, version, licence and why it is worth shipping to every self-hoster. Delete if none. -->

## Notes for the reviewer

<!-- Anything that needs a closer look, trade-offs, or follow-ups. -->
