# 0006 — Reminders via standalone cron job

Status: Proposed

## Decision
A standalone script (`scripts/send-reminders.ts`) run by cron (or a loop in a compose service) imports the same feature services. A pure planner decides what is due. Delivery claims a row in `NotificationLog` with a unique key `(userId, kind, entityId, eventDate, offsetDays, channel)` **before** sending, so overlapping runs cannot double-send. Failures are retried with backoff to a limit, then marked failed. No Redis/BullMQ.

## Alternatives
- In-process scheduler in the web server: duplicates under multiple replicas and ties reminders to web uptime.
- HTTP-triggered job route: extra attack surface needing a shared secret.
- Queue (BullMQ/Redis): unnecessary for MVP volume.

## Consequences
Needs a second process in the container setup and the script must be buildable or runnable with `tsx`. Missed runs are caught up per a documented, tested policy in the planner.

## Implementation notes
- `npm run reminders:send` runs `scripts/send-reminders.ts` (tsx). In containers the same script runs with the environment provided; schedule it hourly with cron.
- The log's unique key is claimed with an insert before sending. A failed send records only a short error code, retries after 15 minutes, 1 hour, 4 hours and 12 hours, and stops after 5 attempts. A claim left `PENDING` for more than 15 minutes (crashed run) can be taken over; the takeover uses an optimistic `updatedAt` check so only one run wins.
- In `compose.yaml` the `reminders` service runs the job in a loop every `REMINDER_INTERVAL_SECONDS` (default 3600) from the same image, after the one-shot `migrate` service has finished ([ADR 0008](./0008-container-image-and-compose-topology.md)). Without `SMTP_HOST` each run logs that reminders are disabled and exits.
- Catch-up rule: a reminder belongs to the smallest configured day bucket that still covers the days left. After an outage you get one current reminder rather than a burst of stale ones.
- Card payment reminders (M-08): an unpaid statement reminds on its real due date for the amount still owed (`entityId` is the statement id) and goes quiet once paid; overdue statements are not reminded (the Statements page shows them). A card with **no** statements falls back to its saved monthly payment due day. Once a card has any statement, the fallback is off, so a paid-off card is not nagged monthly. Trade-off: if you stop entering statements, reminders for that card stop too.
