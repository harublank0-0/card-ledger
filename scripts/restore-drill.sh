#!/bin/sh
# Restore drill: proves that a backup taken by scripts/backup.sh can rebuild a working
# instance on an empty database.
#
#   npm run backup:drill
#
# In a throwaway compose project it starts the stack, loads the synthetic demo data, backs
# it up, destroys the database volume, restores onto the fresh empty database and checks
# that every table has the same number of rows, the app is healthy and the demo user can
# sign in. It also checks retention, that restore refuses a non-empty database without
# --force, and that a failed backup leaves nothing behind. Run it after changing the backup
# scripts and now and then on a real server's copy of the procedure (docs/backup-restore.md).
# Needs Docker with Compose v2.24+ and `openssl`.
set -eu

cd "$(dirname "$0")/.."

PROJECT="card-ledger-drill-$$"
IMAGE="card-ledger-drill:$$"
PORT="${DRILL_PORT:-3197}"
ENV_FILE="$(mktemp)"
BACKUP_DIR="$(mktemp -d)"
LOG="$(mktemp)"
FAILED=1

# The scripts under test and `docker compose` itself read these.
export COMPOSE_PROJECT_NAME="$PROJECT"
export COMPOSE_ENV_FILES="$ENV_FILE"
export CARD_LEDGER_IMAGE="$IMAGE"
export BACKUP_DIR

cleanup() {
	if [ "$FAILED" -ne 0 ]; then
		echo "--- container logs (last lines) ---" >&2
		docker compose logs --tail=30 2>&1 >&2 || true
		echo "--- last command output ---" >&2
		cat "$LOG" >&2 || true
	fi
	docker compose down -v --remove-orphans >/dev/null 2>&1 || true
	docker image rm -f "$IMAGE" >/dev/null 2>&1 || true
	rm -rf "$ENV_FILE" "$BACKUP_DIR" "$LOG"
}
trap cleanup EXIT INT TERM

pass() { echo "ok: $1"; }
fail() { echo "FAIL: $1" >&2; exit 1; }

# Run a command with its output captured; the output is shown only if the drill fails.
run() { "$@" >"$LOG" 2>&1; }

wait_for_health() {
	i=0
	while [ "$i" -lt 90 ]; do
		if curl -fsS "http://127.0.0.1:$PORT/api/health" -o /dev/null 2>/dev/null; then
			return 0
		fi
		i=$((i + 1))
		sleep 2
	done
	return 1
}

psql_db() {
	docker compose exec -T db psql -U cardledger -d cardledger -v ON_ERROR_STOP=1 -tA "$@"
}

# One "table:rows" line per base table in the public schema, exact counts.
row_counts() {
	psql_db -c "select table_name || ':' || (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1"
}

newest_backup() { ls -1 "$BACKUP_DIR"/card-ledger-*.dump | sort | tail -n 1; }
backup_count() { ls -1 "$BACKUP_DIR"/card-ledger-*.dump 2>/dev/null | wc -l | tr -d ' '; }

# Generated per run; nothing here is a real credential.
umask 077
cat >"$ENV_FILE" <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 16)
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
APP_PORT=$PORT
# An SMTP server that is configured but unreachable (the discard port): the live drill stack
# looks like a real one with reminders on, so step 9 can prove restore-test.sh switches them
# off in its copy. The demo account has reminders disabled, so nothing is ever sent.
SMTP_HOST=127.0.0.1
SMTP_PORT=9
SMTP_FROM=drill@example.test
EOF

# 1. Start the stack and load the synthetic demo account.
run docker compose up -d --build || fail "docker compose up failed"
wait_for_health || fail "app did not become healthy"
SEED_OUT="$(docker compose exec -T -e SEED_ALLOW_PRODUCTION=true app node_modules/.bin/tsx prisma/seed.ts 2>&1)" ||
	{ echo "$SEED_OUT" >"$LOG"; fail "seeding the demo data failed"; }
DEMO_PASSWORD="$(echo "$SEED_OUT" | sed -n 's/^ *password: *//p' | head -n 1)"
[ -n "$DEMO_PASSWORD" ] || fail "could not read the demo password from the seed output"
BEFORE="$(row_counts)"
echo "$BEFORE" | grep -q '^user:1$' || fail "expected exactly one user after seeding"
echo "$BEFORE" | grep -Eq '^transaction:[1-9]' || fail "expected demo transactions after seeding"
pass "stack running with demo data"

# 2. A backup is a private, readable file.
run sh scripts/backup.sh || fail "backup failed"
FIRST="$(newest_backup)"
[ -s "$FIRST" ] || fail "backup file missing or empty"
mode="$(ls -l "$FIRST" | awk '{print substr($1, 1, 10)}')"
[ "$mode" = "-rw-------" ] || fail "backup is not private (mode $mode)"
case "$FIRST" in *.partial) fail "backup left a partial file" ;; esac
pass "backup written with private permissions"

# 3. Retention keeps only the newest BACKUP_KEEP files.
BACKUP_KEEP=2 run sh scripts/backup.sh || fail "second backup failed"
BACKUP_KEEP=2 run sh scripts/backup.sh || fail "third backup failed"
[ "$(backup_count)" = "2" ] || fail "retention kept $(backup_count) files, expected 2"
[ ! -e "$FIRST" ] || fail "retention kept the oldest backup"
pass "retention keeps the newest 2 backups"

# 4. A failed backup leaves nothing behind and exits non-zero.
docker compose stop db >/dev/null 2>&1
if sh scripts/backup.sh >"$LOG" 2>&1; then
	fail "backup reported success with the database stopped"
fi
[ "$(backup_count)" = "2" ] || fail "failed backup changed the backup set"
ls "$BACKUP_DIR" | grep -q 'partial' && fail "failed backup left a partial file"
run docker compose up -d --wait db || fail "could not restart the database"
pass "a failed backup leaves nothing behind"

# 5. Restore refuses a non-empty database unless --force is given.
LATEST="$(newest_backup)"
psql_db -q -c "create table drill_marker(v text); insert into drill_marker values ('after-backup')" >/dev/null
if sh scripts/restore.sh "$LATEST" >"$LOG" 2>&1; then
	fail "restore overwrote a non-empty database without --force"
fi
[ "$(psql_db -c 'select count(*) from drill_marker')" = "1" ] || fail "refused restore still changed the database"
# A refusal must not take the running app down.
curl -fsS "http://127.0.0.1:$PORT/api/health" -o /dev/null || fail "a refused restore stopped the app"
pass "restore refuses a non-empty database without --force"

# 5b. A truncated backup (an interrupted copy) is refused before anything is touched, even
#     with --force. `pg_restore --list` reads only the table of contents and accepts a file
#     that lost its last bytes, which would have dropped the database and then failed.
good="$(newest_backup)"
size="$(wc -c <"$good" | tr -d ' ')"
head -c "$((size - 100))" "$good" >"$BACKUP_DIR/interrupted-copy.bin"
counts_before="$(row_counts)"
files_before="$(backup_count)"
if sh scripts/restore.sh "$BACKUP_DIR/interrupted-copy.bin" --force >"$LOG" 2>&1; then
	fail "restore accepted a truncated backup"
fi
grep -q "not a readable backup" "$LOG" || fail "restore did not explain that the backup is unreadable"
[ "$(row_counts)" = "$counts_before" ] || fail "a refused truncated backup changed the database"
[ "$(backup_count)" = "$files_before" ] || fail "a refused truncated backup still wrote a safety backup"
curl -fsS "http://127.0.0.1:$PORT/api/health" -o /dev/null || fail "a refused truncated backup stopped the app"
rm -f "$BACKUP_DIR/interrupted-copy.bin"
pass "restore refuses a truncated backup before touching anything"

# 6. --force restores the backup state and first saves what was there.
before_files="$(backup_count)"
run sh scripts/restore.sh "$LATEST" --force || fail "restore --force failed"
wait_for_health || fail "app did not become healthy after --force restore"
[ "$(psql_db -c "select to_regclass('public.drill_marker') is null")" = "t" ] || fail "--force restore kept data added after the backup"
[ "$(backup_count)" -gt "$before_files" ] || fail "--force restore did not save the previous state first"
[ "$(row_counts)" = "$BEFORE" ] || fail "row counts differ after --force restore"
pass "--force restores the backup and saves the previous state first"

# 7. Disaster recovery: the database volume is gone, restore onto an empty database.
run docker compose down -v || fail "could not remove the stack and its volume"
run docker compose up -d --wait db || fail "could not start an empty database"
[ "$(psql_db -c "select count(*) from information_schema.tables where table_schema = 'public'")" = "0" ] ||
	fail "the new database is not empty"
# Restore the original backup explicitly: the newest file is now the safety backup that
# --force wrote, which still contains the marker table.
run sh scripts/restore.sh "$LATEST" || fail "restore onto an empty database failed"
wait_for_health || fail "app did not become healthy after restore"
AFTER="$(row_counts)"
[ "$AFTER" = "$BEFORE" ] || {
	printf 'before:\n%s\nafter:\n%s\n' "$BEFORE" "$AFTER" >"$LOG"
	fail "row counts differ after restoring onto an empty database"
}
pass "every table has the same row count after restore"

# 8. The restored instance works: the demo user can sign in with the original password.
status="$(curl -s -o /dev/null -w '%{http_code}' \
	-H "Origin: http://localhost:$PORT" -H 'Content-Type: application/json' \
	-d "{\"email\":\"demo@card-ledger.test\",\"password\":\"$DEMO_PASSWORD\"}" \
	"http://127.0.0.1:$PORT/api/auth/sign-in/email")"
[ "$status" = "200" ] || fail "demo user could not sign in after restore (HTTP $status)"
pass "the restored instance accepts the original credentials"

# 9. restore-test.sh proves a real backup restores into a separate, safe copy: it leaves the
#    running stack and its data alone, switches reminders off in the copy (the live stack here
#    has SMTP configured) and cleans up after itself.
live_before="$(row_counts)"
if ! env RESTORE_TEST_PORT=$((PORT + 1)) sh scripts/restore-test.sh "$(newest_backup)" >"$LOG" 2>&1; then
	fail "restore-test.sh failed"
fi
grep -q "restore-test: OK" "$LOG" || fail "restore-test.sh did not report success"
grep -q "reminder emails are off" "$LOG" || fail "restore-test.sh did not check that reminders are off"
[ "$(row_counts)" = "$live_before" ] || fail "restore-test.sh changed the live database"
curl -fsS "http://127.0.0.1:$PORT/api/health" -o /dev/null || fail "restore-test.sh disturbed the running app"
[ -z "$(docker ps -a --filter 'name=card-ledger-restore-test' -q)" ] || fail "restore-test.sh left containers behind"
[ -z "$(docker volume ls -q --filter 'name=card-ledger-restore-test')" ] || fail "restore-test.sh left a volume behind"
pass "restore-test.sh restores into a separate copy, switches reminders off and cleans up"

# 10. A database that is missing altogether (a restore interrupted between DROP and CREATE,
#     or removed by hand) is treated as empty: re-running the restore recovers it.
docker compose exec -T db psql -U cardledger -d postgres -q \
	-c 'DROP DATABASE cardledger WITH (FORCE)' >/dev/null 2>&1 || fail "could not drop the database for the drill"
run sh scripts/restore.sh "$LATEST" || fail "restore could not recover from a missing database"
wait_for_health || fail "app did not become healthy after restoring a missing database"
[ "$(row_counts)" = "$BEFORE" ] || fail "row counts differ after restoring a missing database"
pass "restore recovers when the database is missing"

FAILED=0
echo "restore drill passed"
