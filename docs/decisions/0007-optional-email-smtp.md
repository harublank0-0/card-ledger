# 0007 — Optional email via SMTP

Status: Proposed

## Decision
Email is optional. A small mailer interface has an SMTP transport (Nodemailer, to be justified when added) and a console transport for development. If `SMTP_*` is not configured, reminders are disabled and the UI says so; the rest of the app is unaffected. Emails contain minimal financial detail by default. No third-party email API is required, so self-hosters can use any SMTP relay; a hosted service could be added later as another transport.

## Consequences
No vendor lock-in and no mandatory external calls. Deliverability is the operator's responsibility (documented in the self-hosting guide).
