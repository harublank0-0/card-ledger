# 0010 — pnpm and a pinned toolchain

Status: Proposed

## Context
The project started on npm. Two things went wrong in practice: contributors reasonably followed a `pnpm dlx` hint left by the scaffold, and a `pnpm install` into a tree that npm had built silently dropped the security overrides (pnpm does not read npm's `overrides`), which brought two vulnerable transitive dependencies back. A toolchain that anyone may run in any combination produces results nobody can reproduce.

## Decision
- **pnpm is the package manager**, pinned exactly in `package.json` (`packageManager`, currently `pnpm@12.9.1`) and provided by Corepack, which ships with Node.js 24 (`corepack enable`). The Docker image and CI use the same mechanism, so a contributor, the image and CI resolve the same pnpm.
- **Node.js is pinned to the 24 line** in `.nvmrc` (nvm, fnm and asdf read it), in `engines.node` (`^24`), in the Dockerfile (`NODE_VERSION=24`) and in CI (`node-version-file: .nvmrc`). A patch-exact pin was rejected: it would have to be bumped in four places for every Node.js patch release, for little reproducibility gain over the lockfile and the base image digest.
- **`.npmrc` sets `engine-strict=true`**, so an install on another Node.js or pnpm fails instead of warning.
- **`pnpm-lock.yaml` is the only lockfile**; CI and the image install with `--frozen-lockfile`.
- **pnpm's settings live in `pnpm-workspace.yaml`** (pnpm 12 ignores a `pnpm` field in `package.json`): the two security `overrides` and `allowBuilds`, the short list of dependencies allowed to run install scripts (everything else is blocked).
- **CI keeps ADR 0009's rules**: no third-party action is added for pnpm; Corepack is enabled in a `run` step after the first-party `actions/setup-node`.

`src/toolchain.test.ts` enforces all of this, including that no workflow, Dockerfile or package script still calls npm.

## Alternatives
- Stay on npm and only pin Node.js and npm: the smaller change, and what a purely conservative reading of the problem suggests. Rejected by the maintainer in favour of pnpm's stricter dependency layout and build-script allowlist.
- Pin pnpm with `pnpm/action-setup` in CI: simpler caching, but a third-party action, which ADR 0009 rules out.
- Pin the exact Node.js patch: see above.

## Consequences
- The strict `node_modules` layout means an undeclared (phantom) dependency fails at once instead of working by accident.
- Corepack downloads pnpm during the image build and in CI, from the npm registry, as the build already does for packages. Nothing new is fetched at run time.
- Moving to a newer pnpm or Node.js line is a deliberate edit in `package.json`, `.nvmrc` and the Dockerfile, caught by the test if one of them is missed.
- Prisma still ships its CLI as an npm package; `prisma` and `tsx` remain production dependencies so the migration and reminder containers run from `node_modules/.bin` as before.
