# 0002 — Single codebase, environment-driven deployments

Status: Proposed

## Context
Self-hosted installs and a possible future managed cloud must not diverge.

## Decision
One application, one container image. Differences are configuration only (`SIGNUP_MODE`, SMTP settings, base URL, backups handled by the operator). No edition flag, no cloud-only code paths, no proprietary modules, no required connection to any Card Ledger service, no telemetry.

## Consequences
- Self-hosted simplicity is preserved; cloud is "us running the same image".
- Features are never gated by deployment type.
- Anything cloud-specific (billing, tenant management) would live outside this repository's application code, and is out of scope until demand is validated.
