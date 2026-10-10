# 0007 — Optional email via SMTP

Status: Proposed

## Decision
Email is optional. A small mailer interface has an SMTP transport (Nodemailer, to be justified when added) and a console transport for development. If `SMTP_*` is not configured, reminders are disabled and the UI says so; the rest of the app is unaffected. Emails contain minimal financial detail by default. No third-party email API is required, so self-hosters can use any SMTP relay; a hosted service could be added later as another transport.

## Consequences
No vendor lock-in and no mandatory external calls. Deliverability is the operator's responsibility (documented in the self-hosting guide).

## Implementation notes (M-11 to M-13)
- `src/lib/mailer.server.ts`: SMTP transport (nodemailer, MIT-0 licensed) when `SMTP_HOST` is set; in development without SMTP a console transport logs only recipient and subject; in production without SMTP the runner exits and the Settings page says reminders are paused.
- Development uses Mailpit (`compose.dev.yaml`): SMTP on 127.0.0.1:1025, inbox at http://localhost:8025.
- One digest email per user per run. Bodies are plain text and are never logged.
- STARTTLS is required for any relay that is not on the loopback interface (`requireTLS` in nodemailer, which is otherwise opportunistic and can be downgraded by anyone on the path). `SMTP_REQUIRE_TLS=false` is the explicit opt-out for a trusted plaintext relay. Tested against a fake SMTP server that advertises AUTH but not STARTTLS: the password and message never reach it.
