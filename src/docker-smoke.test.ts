import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// scripts/docker-smoke.sh needs a real Docker to run end to end (CI does that). Its first
// checks only call `docker compose config`, so they are exercised here against a stand-in
// `docker` that behaves the way Compose does on GitHub's runner: it reports ONE missing
// required variable, and which one is not stable between runs. The first CI run passed and
// the next failed on this check with the same script, image and compose file.
const script = path.join(process.cwd(), "scripts", "docker-smoke.sh");

const FAKE_DOCKER = `#!/bin/sh
# Only \`compose ... config\` is simulated; every other command fails so the smoke script
# stops right after the guard checks.
case " $* " in
*" config "*) ;;
*) exit 1 ;;
esac
envfile=""
prev=""
for arg in "$@"; do
	[ "$prev" = "--env-file" ] && envfile="$arg"
	prev="$arg"
done
if [ "\${FAKE_COMPOSE_MODE:-}" = "vague" ]; then
	echo "boom: something unrelated to the variables" >&2
	exit 1
fi
has() { grep -q "^$1=." "$envfile" 2>/dev/null; }
# Reports only the first missing variable, naming BETTER_AUTH_SECRET first when both are missing.
if ! has BETTER_AUTH_SECRET; then
	echo "required variable BETTER_AUTH_SECRET is missing a value" >&2
	exit 1
fi
if ! has POSTGRES_PASSWORD; then
	echo "required variable POSTGRES_PASSWORD is missing a value" >&2
	exit 1
fi
exit 0
`;

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function runGuardChecks(mode: "first-error" | "vague") {
	const bin = mkdtempSync(path.join(tmpdir(), "fake-docker-"));
	dirs.push(bin);
	const docker = path.join(bin, "docker");
	writeFileSync(docker, FAKE_DOCKER);
	chmodSync(docker, 0o755);
	const result = spawnSync("sh", [script], {
		encoding: "utf8",
		timeout: 60_000,
		env: {
			...process.env,
			PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
			FAKE_COMPOSE_MODE: mode,
		},
	});
	return {
		status: result.status,
		output: `${result.stdout}\n${result.stderr}`,
	};
}

describe("scripts/docker-smoke.sh: missing required variables", () => {
	it("checks each required variable on its own, whichever one Compose reports first", () => {
		const { status, output } = runGuardChecks("first-error");
		expect(output).not.toContain("FAIL: missing-variable error");
		expect(output).toContain(
			"a missing POSTGRES_PASSWORD is rejected and named",
		);
		expect(output).toContain(
			"a missing BETTER_AUTH_SECRET is rejected and named",
		);
		expect(output).toContain("an unedited .env.example is rejected");
		// The fake fails the first real compose command, so the script stops there, past the guards.
		expect(output).toContain("FAIL: docker compose up failed");
		expect(status).not.toBe(0);
	});

	it("shows what Compose said when the message names nothing useful", () => {
		const { status, output } = runGuardChecks("vague");
		expect(status).not.toBe(0);
		expect(output).toMatch(/FAIL: missing-variable error does not name \w+/);
		expect(output).toContain("boom: something unrelated to the variables");
	});
});
