# 0005 — Calendar dates and timezones

Status: Proposed

## Decision
- Business dates with no time of day (transaction date, billing/renewal date, expiry, cancellation deadline, statement period, due date, payment date) are stored as `@db.Date` and handled in code as `YYYY-MM-DD` strings. They never pass through `Date` arithmetic in the server's timezone.
- Event moments (`createdAt`, `sentAt`) are UTC timestamps.
- Each user has an IANA timezone (default `Asia/Kathmandu`). "Today" and month boundaries are computed in that timezone via `Intl.DateTimeFormat`.
- Node 24 has no `Temporal`, and adding a date library is not justified for this small surface; `src/lib/calendar-date.ts` is a small pure module with exhaustive tests (month-end clamping, leap years). Revisit if `Temporal` becomes available in the runtime.
- Recurrences are always computed from the anchor date to avoid clamp drift (Jan 31 → Feb 28 → Mar 31).

## Consequences
Deadlines don't shift across timezones; reminders fire on the user's local date; tests are deterministic by injecting "today".
