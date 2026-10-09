# 0004 — Money as integer minor units

Status: Proposed

## Decision
Store money as `Int` minor units (`amountMinor`) with an ISO 4217 `currency` (`Char(3)`). Compute and compare in integers. Format only at the UI edge with `Intl.NumberFormat`. Exponents come from a small currency table (NPR, USD = 2; zero-decimal currencies supported). Different currencies are never summed; the MVP shows per-currency totals. Amounts are stored positive; refunds are a transaction type.

## Alternatives
- Prisma `Decimal`: exact, but requires decimal.js handling across server-function serialization and tests.
- `BigInt`: no cap, but extra serialization friction. An `Int` holds ~21.4M major units; a later widening migration is mechanical.
- Float: rejected.

## Consequences
Simple arithmetic and trivial unit tests; sub-minor-unit precision (e.g., FX rates) is out of scope until conversion is introduced.
