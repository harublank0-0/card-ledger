# 0011 — A published container image

Status: Proposed

## Context
Self-hosting meant cloning the repository and building the image locally: about three minutes, a
1 GB layer cache and the build tools, before anyone could even look at the app. People trying a
self-hosted tool tend to want `docker compose pull` and a running stack.

An image is also a stronger promise than source: it is what people run with their financial data.
So how it is built, tested and tagged is part of the project's security story, and the pipeline
must keep ADR 0009's rules (no secrets, first-party actions pinned by SHA, least privilege).

## Decision
- **Registry: GitHub Container Registry**, `ghcr.io/harublank0-0/card-ledger`. It needs no account
  beyond GitHub and no stored credential: the workflow logs in with its own `github.token`.
- **Only on a version tag** (`vMAJOR.MINOR.PATCH`), never from `main` and never from a pull
  request. Every image corresponds to a reviewed, published release.
- **Tags: `X.Y.Z` and `X.Y`. There is no `latest`.** Migrations only move forward and the app holds
  financial data, so an upgrade must be a choice. The minor tag follows the newest patch release.
- **Architectures: `linux/amd64` and `linux/arm64`**, each built on a native runner
  (`ubuntu-24.04` and `ubuntu-24.04-arm`) and merged into one manifest with
  `docker buildx imagetools create`. No emulation, no third-party action.
- **Test the exact artefact before it is pushed.** `scripts/build-image.sh` builds it (also used by
  `image-check.yml` on pull requests, which builds and smoke-tests both architectures without any
  registry access or write permission), and `SMOKE_IMAGE=<ref> sh scripts/docker-smoke.sh` runs the
  stack smoke test on that image as built, without rebuilding or removing it.
- **Least privilege.** `packages: write` is granted to the two jobs of `publish-image.yml` that
  push, and nowhere else; the workflow's top-level permissions stay `contents: read`. The tag name
  reaches the scripts through `env`, is checked against the version pattern first, and a tag that
  does not match publishes nothing.
- **Provenance.** The image carries OCI labels for its source repository, commit, version and
  licence (`docker image inspect` shows them).

`src/workflows.test.ts` and `src/build-image.test.ts` enforce these properties.

## Alternatives
- **Docker Hub:** more discoverable, but it needs an account and a stored access token, which
  breaks the no-secrets rule.
- **`latest` as well:** what many people expect, but it invites unattended upgrades through an
  auto-updater, with forward-only migrations and no backup.
- **A rolling `edge` image from `main`:** convenient for testers, but it puts unreleased code in
  front of real financial data.
- **`docker/build-push-action` and friends:** less shell, but third-party actions, which ADR 0009
  rules out. Plain `docker` and `docker buildx` on the runner do the same here.
- **amd64 only:** half the work, but Apple-silicon and Raspberry Pi users would still have to
  build.

## Consequences
- The first image is 0.1.1; 0.1.0 is built from source.
- The package is linked to the public repository by the image's source label and was public from
  its first push, with no manual step. `docs/releasing.md` says how to check it, and what to do if
  a changed default makes it private.
- A release now takes about as long as the slower architecture's build and smoke test.
- Not done yet: signing (for example cosign) and SBOM attestations, and pinning the base image by
  digest. Each is a separate decision, because it adds either a tool or a rebuild routine.
