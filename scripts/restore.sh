#!/bin/sh
# Restore a backup made by scripts/backup.sh.
#
#   scripts/restore.sh <backup.dump>            into an EMPTY database (new server, new volume)
#   scripts/restore.sh <backup.dump> --force    replace the current database
#
# Without --force it refuses a database that already has tables, so a typo cannot overwrite
# live data. With --force it first stops the app and the reminder job, then writes a safety
# backup of what is there (and aborts, restarting them, if it cannot), then drops and
# recreates the database. The restore itself is a single transaction: if it fails, nothing is
# half-restored. A database that is missing altogether (an earlier restore interrupted after
# the drop) is treated as empty, so simply running the restore again recovers it.
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

safety=""
dropped=0
restored=0

# If anything fails after the database was dropped, say exactly how to get back.
on_exit() {
	status=$?
	if [ "$status" -ne 0 ] && [ "$dropped" -eq 1 ] && [ "$restored" -eq 0 ]; then
		echo "restore: INTERRUPTED after the database was dropped. It is empty or missing and the" >&2
		echo "         app and reminders are stopped." >&2
		if [ -n "$safety" ]; then
			echo "         Your previous data is in: $safety" >&2
			echo "         Get it back with:  sh scripts/restore.sh $safety" >&2
		fi
		echo "         Or restore the backup you meant to use:  sh scripts/restore.sh <file>" >&2
	fi
}
trap on_exit EXIT

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

exists="$(psql_db -d postgres -c "select count(*) from pg_database where datname = 'cardledger'")"
tables=0
if [ "$exists" != "0" ]; then
	tables="$(psql_db -d cardledger -c "select count(*) from information_schema.tables where table_schema = 'public'")"
fi
if [ "$tables" != "0" ] && [ "$force" -ne 1 ]; then
	echo "restore: the database already contains $tables tables; nothing was changed." >&2
	echo "         To replace it, run again with --force (a safety backup is written first)." >&2
	exit 1
fi

# Only now, with the decision made, stop the writers: anything they wrote between a dump and
# the stop would otherwise be in neither the safety backup nor the restored data.
echo "restore: stopping the app and the reminder job"
docker compose stop app reminders >/dev/null 2>&1 || true

if [ "$tables" != "0" ]; then
	echo "restore: writing a safety backup of the current database first"
	# Never prune while restoring: the file being restored may be the oldest one.
	if ! made="$(BACKUP_KEEP=999999 sh scripts/backup.sh)"; then
		echo "restore: the safety backup failed, so nothing was changed" >&2
		docker compose start app reminders >/dev/null 2>&1 || true
		exit 1
	fi
	echo "$made"
	safety="$(printf '%s\n' "$made" | sed -n 's/^backup written: \(.*\) ([0-9][0-9]* bytes)$/\1/p')"
fi

if [ "$tables" != "0" ]; then
	echo "restore: recreating the empty database"
	dropped=1
	psql_db -d postgres -q \
		-c 'DROP DATABASE cardledger WITH (FORCE)' \
		-c 'CREATE DATABASE cardledger OWNER cardledger'
elif [ "$exists" = "0" ]; then
	echo "restore: the database is missing; creating it"
	dropped=1
	psql_db -d postgres -q -c 'CREATE DATABASE cardledger OWNER cardledger'
fi

echo "restore: restoring"
if ! docker compose exec -T db pg_restore -U cardledger -d cardledger \
	--no-owner --single-transaction --exit-on-error <"$file"; then
	if [ -n "$safety" ]; then
		echo "restore: pg_restore failed and the database is now empty (the restore is one transaction)." >&2
	else
		echo "restore: pg_restore failed; the database is still empty (the restore is one transaction)." >&2
	fi
	echo "         The app and reminders are stopped." >&2
	exit 1
fi
restored=1

echo "restore: starting the stack (applies any newer migrations)"
docker compose up -d >/dev/null

echo "restore: done. Check: curl -fsS http://127.0.0.1:\${APP_PORT:-3000}/api/health"
