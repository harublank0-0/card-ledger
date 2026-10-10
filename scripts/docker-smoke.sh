#!/bin/sh
# Smoke test for the self-hosting stack (Dockerfile + compose.yaml).
#
#   npm run docker:smoke
#
# Builds the image, starts the stack under a throwaway project name with generated
# secrets, and checks the properties an operator relies on: it comes up healthy, the
# database is not reachable from the host, the app listens on loopback only, containers run
# as non-root, the image carries no secrets, and data survives a restart. Everything it
# creates is removed on exit. Needs Docker with Compose v2 and `openssl`; no network access
# other than pulling base images and npm packages for the build.
set -eu

cd "$(dirname "$0")/.."

PROJECT="card-ledger-smoke-$$"
IMAGE="card-ledger-smoke:$$"
PORT="${SMOKE_PORT:-3198}"
ENV_FILE="$(mktemp)"
FAILED=1

compose() {
	CARD_LEDGER_IMAGE="$IMAGE" docker compose -p "$PROJECT" --env-file "$ENV_FILE" "$@"
}

# Run a compose command with its progress output captured; show it only if the command fails.
quiet() {
	if ! out="$("$@" 2>&1)"; then
		echo "$out" >&2
		return 1
	fi
}

cleanup() {
	if [ "$FAILED" -ne 0 ]; then
		echo "--- container logs (last lines) ---" >&2
		compose logs --tail=40 2>&1 >&2 || true
	fi
	compose down -v --remove-orphans >/dev/null 2>&1 || true
	docker image rm -f "$IMAGE" >/dev/null 2>&1 || true
	rm -f "$ENV_FILE"
}
trap cleanup EXIT INT TERM

pass() { echo "ok: $1"; }
fail() { echo "FAIL: $1" >&2; exit 1; }

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

# Generated per run; nothing here is a real credential.
umask 077
cat >"$ENV_FILE" <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 16)
BETTER_AUTH_SECRET=$(openssl rand -hex 32)
APP_PORT=$PORT
REMINDER_INTERVAL_SECONDS=3600
EOF

# 1. A missing required variable must fail loudly and name the variable.
EMPTY_ENV="$(mktemp)"
if message="$(CARD_LEDGER_IMAGE="$IMAGE" docker compose -p "$PROJECT-guard" --env-file "$EMPTY_ENV" config 2>&1)"; then
	rm -f "$EMPTY_ENV"
	fail "compose accepted an empty environment"
fi
rm -f "$EMPTY_ENV"
echo "$message" | grep -q "POSTGRES_PASSWORD" || fail "missing-variable error does not name POSTGRES_PASSWORD"
pass "missing required variables are rejected with a readable message"

# An unedited copy of .env.example must not be bootable (its secrets are empty).
if CARD_LEDGER_IMAGE="$IMAGE" docker compose -p "$PROJECT-guard" --env-file .env.example config >/dev/null 2>&1; then
	fail "compose accepted the unedited .env.example"
fi
pass "an unedited .env.example is rejected"

# 2. Build and start.
quiet compose up -d --build || fail "docker compose up failed"
wait_for_health || fail "app did not become healthy within 180 seconds"
body="$(curl -fsS "http://127.0.0.1:$PORT/api/health")"
[ "$body" = '{"status":"ok"}' ] || fail "unexpected health body: $body"
pass "app is healthy at /api/health"

# The server-rendered app must work too, not only the health endpoint: a missing runtime
# dependency would surface here first.
page="$(curl -fsS "http://127.0.0.1:$PORT/sign-in")" || fail "/sign-in did not render"
echo "$page" | grep -q "Sign in to your ledger" || fail "/sign-in rendered without the sign-in form"
pass "the app renders its sign-in page"

# 3. One-shot migration finished cleanly.
migrate_id="$(compose ps -a -q migrate)"
[ -n "$migrate_id" ] || fail "migrate service not found"
code="$(docker inspect -f '{{.State.ExitCode}}' "$migrate_id")"
[ "$code" = "0" ] || fail "migrate exited with $code"
pass "migrations applied by the one-shot migrate service"

# 4. The database has no published port; the app is on loopback only.
db_id="$(compose ps -q db)"
[ -z "$(docker port "$db_id")" ] || fail "database publishes a port: $(docker port "$db_id")"
pass "database publishes no port"
app_id="$(compose ps -q app)"
bound="$(docker port "$app_id" 3000/tcp)"
[ "$bound" = "127.0.0.1:$PORT" ] || fail "app is published as '$bound', expected 127.0.0.1:$PORT"
pass "app is published on 127.0.0.1 only"

# 5. Non-root.
for service in app reminders; do
	uid="$(compose exec -T "$service" id -u)"
	[ "$uid" != "0" ] || fail "$service runs as root"
done
pass "app and reminders run as a non-root user"

# 6. The image carries no secrets and no local env files.
if docker run --rm --entrypoint env "$IMAGE" | grep -Ei 'secret|password|database_url' >/dev/null; then
	fail "the image environment contains secret-looking variables"
fi
docker run --rm --entrypoint sh "$IMAGE" -c 'test ! -e /app/.env && test ! -e /app/.env.local && test ! -d /app/.git' ||
	fail "the image contains env files or git history"
# ...at any depth (a nested prisma/.env or a stray dump), outside third-party packages.
leaked="$(docker run --rm --entrypoint sh "$IMAGE" -c \
	'find /app \( -name node_modules -prune \) -o \( -name ".env" -o -name ".env.*" -o -name "*.local" -o -name "*.dump" -o -name "*.dump.*" -o -name backups \) -print')"
[ -z "$leaked" ] || fail "the image contains files that must never ship: $leaked"
pass "the image contains no secrets or env files"

# No usage ping from the Prisma CLI in the image (it also covers the build stage, which
# inherits the same variable).
docker run --rm --entrypoint env "$IMAGE" | grep -q '^CHECKPOINT_DISABLE=1$' ||
	fail "the image does not disable the Prisma CLI's usage ping"
pass "the Prisma CLI's usage ping is disabled in the image"

# 7. The reminder job runs and reports (SMTP is not configured, so it is a no-op).
i=0
until compose logs reminders 2>/dev/null | grep -Eq 'reminders disabled|reminder run finished'; do
	i=$((i + 1))
	[ "$i" -lt 30 ] || fail "reminders service produced no run output"
	sleep 2
done
pass "reminders service runs the job"

# 8. Data survives a restart; migrate is safe to run again.
compose exec -T db psql -U cardledger -d cardledger -v ON_ERROR_STOP=1 -q \
	-c "create table smoke_marker(v text); insert into smoke_marker values ('persisted');" >/dev/null
quiet compose down || fail "docker compose down failed"
quiet compose up -d || fail "restart failed"
wait_for_health || fail "app did not become healthy after restart"
value="$(compose exec -T db psql -U cardledger -d cardledger -tA -c 'select v from smoke_marker')"
[ "$value" = "persisted" ] || fail "data did not survive the restart (got '$value')"
pass "data survives a restart"

FAILED=0
echo "docker smoke test passed"
