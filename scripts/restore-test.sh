#!/bin/sh
# Prove that one of your real backups restores into a working copy, without touching the
# running instance.
#
#   sh scripts/restore-test.sh backups/card-ledger-<timestamp>-01.dump [--keep]
#
# It starts a separate, throwaway compose project (unique name, its own database volume and
# port), restores the backup into it, waits for /api/health, prints a few row counts, and
# removes everything again. With --keep the copy stays up so you can sign in and look around
# at http://localhost:$RESTORE_TEST_PORT (default 3199); the command to remove it is printed.
#
# Safety by construction:
#   - every compose command names its project with -p, so nothing can resolve to your live stack;
#   - SMTP is switched off in the copy, so a restored copy of real data can never send a
#     reminder email to real people (the script checks the job reports "reminders disabled");
#   - it reads your .env for secrets and the database password, and changes nothing there.
set -eu

cd "$(dirname "$0")/.."

file=""
keep=0
for arg in "$@"; do
	case "$arg" in
		--keep) keep=1 ;;
		-*)
			echo "usage: sh scripts/restore-test.sh <backup.dump> [--keep]" >&2
			exit 2
			;;
		*) file="$arg" ;;
	esac
done
if [ -z "$file" ] || [ ! -s "$file" ]; then
	echo "usage: sh scripts/restore-test.sh <backup.dump> [--keep]" >&2
	echo "restore-test: '$file' does not exist or is empty" >&2
	exit 2
fi

PORT="${RESTORE_TEST_PORT:-3199}"
PROJECT="card-ledger-restore-test-$$"

# Everything below, including scripts/restore.sh, inherits these.
export COMPOSE_PROJECT_NAME="$PROJECT"
export APP_PORT="$PORT"
export BETTER_AUTH_URL="http://localhost:$PORT"
SMTP_HOST=""
SMTP_PORT=""
SMTP_USER=""
SMTP_PASSWORD=""
SMTP_FROM=""
export SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASSWORD SMTP_FROM

compose() { docker compose -p "$PROJECT" "$@"; }

cleanup() {
	status=$?
	if [ "$keep" -eq 1 ] && [ "$status" -eq 0 ]; then
		echo
		echo "The restored copy is running at http://localhost:$PORT (project $PROJECT)."
		echo "Remove it, including its database volume, with:"
		echo "  docker compose -p $PROJECT down -v"
		return
	fi
	compose down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

echo "restore-test: starting an empty database in project $PROJECT"
compose up -d --wait db >/dev/null

echo "restore-test: restoring $file"
sh scripts/restore.sh "$file" >/dev/null

echo "restore-test: waiting for the restored app to become healthy"
i=0
until curl -fsS "http://127.0.0.1:$PORT/api/health" -o /dev/null 2>/dev/null; do
	i=$((i + 1))
	if [ "$i" -ge 90 ]; then
		echo "restore-test: the restored copy did not become healthy" >&2
		compose logs --tail=30 >&2 || true
		exit 1
	fi
	sleep 2
done

echo "restore-test: checking that reminder emails are off in the copy"
i=0
until compose logs reminders 2>/dev/null | grep -q "reminders disabled"; do
	i=$((i + 1))
	if [ "$i" -ge 30 ]; then
		echo "restore-test: the copy's reminder job did not report that it is disabled; refusing to continue" >&2
		exit 1
	fi
	sleep 2
done

echo "restore-test: rows per table in the restored copy:"
compose exec -T db psql -U cardledger -d cardledger -tA -c "
	select '  ' || table_name || ': ' ||
	  (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
	from information_schema.tables
	where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> '_prisma_migrations'
	order by table_name"

echo
echo "restore-test: OK. The backup restores into a working, healthy copy."
