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
