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
- Catch-up rule: a reminder belongs to the smallest configured day bucket that still covers the days left. After an outage you get one current reminder rather than a burst of stale ones.
