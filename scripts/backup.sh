#!/bin/sh
# Write a consistent backup of the Card Ledger database.
#
#   scripts/backup.sh              (or: npm run backup)
#
# Runs pg_dump inside the `db` container, so no PostgreSQL client is needed on the host, and
# works while the app is running. Output is a custom-format dump:
#
#   $BACKUP_DIR/card-ledger-<UTC timestamp>-<NN>.dump      (default: ./backups)
#
# Environment:
#   BACKUP_DIR   where to write (default: backups, relative to the repository root)
#   BACKUP_KEEP  how many of the newest backups to keep (default: 14)
#
# A backup contains every user's financial data: it is written readable by you only, and
# off-host copies should be encrypted (docs/backup-restore.md). The file appears under its
# final name only after pg_dump finished and the whole archive was read back successfully.
set -eu

cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-backups}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"

case "$BACKUP_KEEP" in
	'' | *[!0-9]*)
		echo "backup: BACKUP_KEEP must be a positive integer, got '$BACKUP_KEEP'" >&2
		exit 2
		;;
esac
# Strip leading zeros: shell arithmetic reads 010 as octal 8 and 00 as 0 (which would select
# every backup, including the new one, for deletion).
BACKUP_KEEP="${BACKUP_KEEP#"${BACKUP_KEEP%%[!0]*}"}"
if [ -z "$BACKUP_KEEP" ]; then
	echo "backup: BACKUP_KEEP must be at least 1; 0 would delete every backup" >&2
	exit 2
fi

umask 077
mkdir -p "$BACKUP_DIR"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
n=1
while :; do
	suffix="$(printf '%02d' "$n")"
	final="$BACKUP_DIR/card-ledger-$stamp-$suffix.dump"
	[ -e "$final" ] || break
	n=$((n + 1))
	if [ "$n" -gt 99 ]; then
		echo "backup: too many backups within one second" >&2
		exit 1
	fi
done
partial="$final.partial"

cleanup_partial() { rm -f -- "$partial"; }
trap cleanup_partial EXIT INT TERM

if ! docker compose exec -T db pg_dump -U cardledger -d cardledger \
	--format=custom --no-owner >"$partial"; then
	echo "backup: pg_dump failed (is the stack running? try: docker compose ps)" >&2
	exit 1
fi

if [ ! -s "$partial" ]; then
	echo "backup: pg_dump produced an empty file" >&2
	exit 1
fi

# Read the whole archive back, not just its table of contents (`pg_restore --list` accepts a
# file that lost its last bytes): a truncated or unreadable dump fails here instead of at
# restore time. This is not a checksum; it cannot prove a silent bit flip did not happen.
if ! docker compose exec -T db pg_restore -f /dev/null <"$partial" >/dev/null 2>&1; then
	echo "backup: the dump could not be read back in full" >&2
	exit 1
fi

mv -- "$partial" "$final"
trap - EXIT INT TERM

# Retention: keep the newest BACKUP_KEEP, remove the rest.
total="$(ls -1 "$BACKUP_DIR"/card-ledger-*.dump 2>/dev/null | wc -l | tr -d ' ')"
if [ "$total" -gt "$BACKUP_KEEP" ]; then
	ls -1 "$BACKUP_DIR"/card-ledger-*.dump | sort | head -n "$((total - BACKUP_KEEP))" |
		while IFS= read -r old; do
			# Never remove what was just written, whatever the file names sort like.
			if [ "$old" != "$final" ]; then rm -f -- "$old"; fi
		done
fi

echo "backup written: $final ($(wc -c <"$final" | tr -d ' ') bytes)"
