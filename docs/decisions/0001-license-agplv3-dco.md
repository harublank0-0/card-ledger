# 0001 — License: AGPLv3 with DCO

Status: Accepted.

## Context
Card Ledger is open source and self-hostable, with a possible future managed cloud. The license must keep the software free to self-host, discourage closed hosted forks, and keep contribution friction low.

## Decision
- License the project under **GNU AGPLv3**. The SPDX identifier is **`AGPL-3.0-only`** (decided in F-06): the terms stay fixed at version 3, so a future FSF license version cannot change the terms for this code without the maintainers' decision. `LICENSE` is the unmodified FSF text of 19 November 2007 and `package.json` declares the same identifier.
- Accept contributions under the **Developer Certificate of Origin (DCO)**: each commit carries `Signed-off-by` (`git commit -s`). Contributions are licensed under the project license (inbound = outbound). **No CLA.**
- No proprietary licensing, feature locks, license keys, or license verification, in any edition.

## Implications
- **Network use (AGPL §13):** anyone who modifies Card Ledger and lets users interact with it over a network (including a hosted service) must offer those users the corresponding source of their modified version. Running an *unmodified* copy for yourself or others has no extra obligation beyond license notices.
- **Self-hosters** may use, modify, and run it freely; they must keep license notices and, if they modify and offer it over a network, publish their changes under AGPLv3.
- **Our own cloud** is also bound by AGPLv3 for contributed code. Because there is no CLA, we **cannot relicense or dual-license contributions** (e.g., to a proprietary cloud edition) without every contributor's consent. The maintainers' own code could be dual-licensed, but mixed code could not. This is accepted: the cloud offering sells operations (hosting, backups, updates, email), not closed features.
- **Dependencies** must be license-compatible with AGPLv3 (checked in O-05).
- Because "no feature locks" is a project principle, the cloud and self-hosted code stay identical.

## Alternatives considered
- GPLv3: no network-use clause; hosted forks could stay private.
- MIT/Apache: permissive; allows closed hosted competitors.
- AGPL + CLA: keeps relicensing option but adds contributor friction and trust cost.

## Consequences
Document DCO and AGPL obligations in CONTRIBUTING.md; add a DCO check to CI (O-03).
