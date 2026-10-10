#!/bin/sh
# Restore a backup made by scripts/backup.sh.
#
#   scripts/restore.sh <backup.dump>            into an EMPTY database (new server, new volume)
#   scripts/restore.sh <backup.dump> --force    replace the current database
#
# Without --force it refuses a database that already has tables, so a typo cannot overwrite
# live data. With --force it first writes a safety backup of what is there (and aborts if it
# cannot), then drops and recreates the database. The restore itself is a single
# transaction: if it fails, nothing is half-restored.
#
# Afterwards it starts the stack, which runs the one-shot migrate service, so restoring a
# backup taken by an older version also brings the schema up to date.
set -eu

cd "$(dirname "$0")/.."

file=""
force=0
for arg in "$@"; do
	case "$arg" in
		--force) force=1 ;;
		-*)
			echo "usage: scripts/restore.sh <backup.dump> [--force]" >&2
			exit 2
			;;
		*) file="$arg" ;;
	esac
done

if [ -z "$file" ]; then
	echo "usage: scripts/restore.sh <backup.dump> [--force]" >&2
	exit 2
fi
if [ ! -s "$file" ]; then
	echo "restore: '$file' does not exist or is empty" >&2
	exit 1
fi

psql_db() { docker compose exec -T db psql -U cardledger -v ON_ERROR_STOP=1 -tA "$@"; }

echo "restore: starting the database"
docker compose up -d --wait db >/dev/null

# Read the whole archive, not just its table of contents: a copy that lost its last bytes
# (an interrupted transfer) passes `pg_restore --list` and would fail only after the current
# database had been dropped.
echo "restore: checking the backup file"
if ! docker compose exec -T db pg_restore -f /dev/null <"$file" >/dev/null 2>&1; then
	echo "restore: '$file' is not a readable backup (truncated or damaged); nothing was changed" >&2
	exit 1
fi

tables="$(psql_db -d cardledger -c "select count(*) from information_schema.tables where table_schema = 'public'")"
if [ "$tables" != "0" ] && [ "$force" -ne 1 ]; then
	echo "restore: the database already contains $tables tables; nothing was changed." >&2
	echo "         To replace it, run again with --force (a safety backup is written first)." >&2
	exit 1
fi

if [ "$tables" != "0" ]; then
	echo "restore: writing a safety backup of the current database first"
	# Never prune while restoring: the file being restored may be the oldest one.
	if ! BACKUP_KEEP=999999 sh scripts/backup.sh; then
		echo "restore: the safety backup failed, so nothing was changed" >&2
		exit 1
	fi
fi

recreated=0
echo "restore: stopping the app and the reminder job"
docker compose stop app reminders >/dev/null 2>&1 || true

if [ "$tables" != "0" ]; then
	echo "restore: recreating the empty database"
	psql_db -d postgres -q \
		-c 'DROP DATABASE cardledger WITH (FORCE)' \
		-c 'CREATE DATABASE cardledger OWNER cardledger'
	recreated=1
fi

echo "restore: restoring"
if ! docker compose exec -T db pg_restore -U cardledger -d cardledger \
	--no-owner --single-transaction --exit-on-error <"$file"; then
	if [ "$recreated" -eq 1 ]; then
		echo "restore: pg_restore failed and the database is now empty. The previous data is in the" >&2
		echo "         safety backup written above (newest file in the backup directory)." >&2
	else
		echo "restore: pg_restore failed; the database is still empty (the restore is one transaction)." >&2
	fi
	echo "         The app and reminders are stopped." >&2
	exit 1
fi

echo "restore: starting the stack (applies any newer migrations)"
docker compose up -d >/dev/null

echo "restore: done. Check: curl -fsS http://127.0.0.1:\${APP_PORT:-3000}/api/health"
