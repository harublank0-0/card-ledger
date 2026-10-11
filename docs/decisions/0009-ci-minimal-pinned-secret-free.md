# 0009 — CI: minimal, pinned and secret-free

Status: Proposed

## Context
CI protects a project that handles financial data and is built by outside contributors, so the pipeline itself must not become the weakest link, and it must work identically for pull requests from forks.

## Decision
- **No secrets.** Nothing in the workflows reads a repository secret. The database password and auth secret used by the test job are throwaway constants for a container that exists only for that job, so fork pull requests run exactly the checks maintainers' do.
- **Least privilege.** Workflows declare `permissions: contents: read`, and checkout uses `persist-credentials: false`.
- **Only first-party actions, pinned by commit SHA** with the version in a comment (`actions/checkout`, `actions/setup-node`). A mutable tag can be moved; a SHA cannot. Updating them is a deliberate, reviewed change; a release is preferred to be at least a few weeks old when pinned.
- **The runner image is pinned** (`ubuntu-24.04`), not `ubuntu-latest`, which GitHub moves to a new OS release on its own schedule (Ubuntu 26 from 2026-10-19). The label is the image the first run passed on; moving to a newer one is a deliberate change made in the workflow files, and `src/workflows.test.ts` enforces it.
- **Untrusted values never go into `run:` scripts directly.** Event values are passed through `env:` (for example the pull request's base and head SHAs).
- **DCO is enforced by a script in the repository** (`scripts/check-dco.sh`), not by a third-party GitHub App. A commit passes when it has a `Signed-off-by` trailer whose email equals the author's email (case-insensitive); merge commits are skipped. It checks pull request ranges only, so the unsigned scaffold commit at the root of history is out of scope.
- **What runs:** `verify` (Biome, typecheck, tests against a PostgreSQL service container, which include the dependency licence check against an AGPL-3.0-only allowlist, build, and a check that the auth secret is absent from the client bundle), `dco`, `docker` (the same `scripts/docker-smoke.sh` operators can run), and `audit` (`npm audit` for production dependencies, informational and non-blocking). The restore drill runs in its own workflow weekly, on demand and when the backup tooling or stack definition changes, because it takes minutes.
- **Validated before first use** with `actionlint`, plus running the steps' commands locally. A workflow cannot be proven green on GitHub before the first push. First run on GitHub (2026-10-11, `83f42d3`): `verify` and `docker` passed; the informational `audit` job failed as designed (four known high advisories); `dco` (pull requests only) and the restore drill have not run there yet. The next run failed `docker` on a smoke-script check that assumed which missing variable Compose names first (fixed in `d41fbde`); a stand-in `docker` in `src/docker-smoke.test.ts` now covers that guard without a Docker daemon.

## Alternatives
- A DCO GitHub App: less code, but a third party with repository access and a service the project would depend on.
- Tag-pinned actions (`@v7`): easier to update, but not reproducible and open to tag movement.
- Running the restore drill on every pull request: slower feedback for little gain; path filters plus a weekly schedule cover it.

## Consequences
- Maintainers update pinned SHAs by hand (or, later, with a dependency bot).
- Branch protection should require `verify`, `dco` and `docker` once the repository is on GitHub; that setting is outside the repository.
