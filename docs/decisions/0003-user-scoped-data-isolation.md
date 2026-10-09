# 0003 — User-scoped data isolation

Status: Proposed

## Context
Data must be isolated per user for self-hosted multi-user use and future hosting, without introducing organizations or workspaces.

## Decision
- Every domain row has `userId`. Services receive `userId` from the authenticated session (server-function middleware) and scope **every** query by it. Lookups by `id` alone are not allowed; ids supplied by the client that reference other entities are verified to belong to the same user.
- Each feature ships cross-user and unauthenticated tests.
- Postgres **row-level security is deferred**: it complicates Prisma connections (per-request settings), migrations, and the standalone job. Reconsider before hosting at scale (Phase 5).

## Consequences
Isolation depends on discipline plus tests; a missed `userId` filter is a vulnerability. Mitigated by small service APIs that take `userId` first, code review, and per-feature isolation tests.
