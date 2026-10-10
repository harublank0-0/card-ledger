import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const script = path.join(process.cwd(), "scripts", "check-dco.sh");
const dirs: string[] = [];

/** A pristine git environment: no global signing, hooks or identity leaking in. */
const gitEnv = {
	...process.env,
	GIT_CONFIG_GLOBAL: "/dev/null",
	GIT_CONFIG_NOSYSTEM: "1",
	GIT_TERMINAL_PROMPT: "0",
};

function git(cwd: string, ...args: string[]) {
	return execFileSync("git", args, {
		cwd,
		env: gitEnv,
		encoding: "utf8",
	}).trim();
}

function makeRepo() {
	const dir = mkdtempSync(path.join(tmpdir(), "card-ledger-dco-"));
	dirs.push(dir);
	git(dir, "init", "-q", "-b", "main");
	git(dir, "config", "user.name", "Dev Eloper");
	git(dir, "config", "user.email", "dev@example.com");
	git(dir, "config", "commit.gpgsign", "false");
	git(dir, "config", "core.hooksPath", "/dev/null");
	return dir;
}

let counter = 0;
function commit(
	repo: string,
	subject: string,
	signoff?: string,
	options: { author?: string; file?: string } = {},
) {
	const file = options.file ?? "file.txt";
	writeFileSync(path.join(repo, file), `${++counter}\n`);
	git(repo, "add", file);
	const message = signoff ? `${subject}\n\nSigned-off-by: ${signoff}` : subject;
	const args = ["commit", "-q", "-m", message];
	if (options.author) args.push("--author", options.author);
	git(repo, ...args);
	return git(repo, "rev-parse", "HEAD");
}

function check(repo: string, ...args: string[]) {
	const result = spawnSync("sh", [script, ...args], {
		cwd: repo,
		env: gitEnv,
		encoding: "utf8",
	});
	return {
		status: result.status,
		output: `${result.stdout}${result.stderr}`,
	};
}

beforeAll(() => {
	counter = 0;
});
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("scripts/check-dco.sh", () => {
	it("passes when every commit carries a matching Signed-off-by", () => {
		const repo = makeRepo();
		const base = commit(repo, "chore: base", "Dev Eloper <dev@example.com>");
		commit(repo, "feat: one", "Dev Eloper <dev@example.com>");
		commit(repo, "fix: two", "Dev Eloper <dev@example.com>");
		const result = check(repo, `${base}..HEAD`);
		expect(result.status).toBe(0);
		expect(result.output).toContain("2 commits");
	});

	it("fails and names a commit that has no sign-off", () => {
		const repo = makeRepo();
		const base = commit(repo, "chore: base", "Dev Eloper <dev@example.com>");
		const unsigned = commit(repo, "feat: forgot to sign off");
		const result = check(repo, `${base}..HEAD`);
		expect(result.status).toBe(1);
		expect(result.output).toContain(unsigned.slice(0, 7));
		expect(result.output).toContain("feat: forgot to sign off");
		expect(result.output).toContain("git rebase --signoff");
	});

	it("fails when the sign-off email is not the author's", () => {
		const repo = makeRepo();
		const base = commit(repo, "chore: base", "Dev Eloper <dev@example.com>");
		const wrong = commit(
			repo,
			"feat: signed by someone else",
			"Other <other@example.com>",
		);
		const result = check(repo, `${base}..HEAD`);
		expect(result.status).toBe(1);
		expect(result.output).toContain(wrong.slice(0, 7));
	});

	it("compares emails case-insensitively", () => {
		const repo = makeRepo();
		const base = commit(repo, "chore: base", "Dev Eloper <dev@example.com>");
		commit(repo, "feat: shouting", "Dev Eloper <DEV@Example.COM>");
		expect(check(repo, `${base}..HEAD`).status).toBe(0);
	});

	it("compares emails case-insensitively when the author's is the one in capitals", () => {
		const repo = makeRepo();
		const base = commit(repo, "chore: base", "Dev Eloper <dev@example.com>");
		commit(repo, "feat: mixed-case author", "Mixed Case <mixed@example.com>", {
			author: "Mixed Case <MiXed@Example.com>",
		});
		expect(check(repo, `${base}..HEAD`).status).toBe(0);
	});

	it("accepts a contributor's own sign-off on a commit they authored", () => {
		const repo = makeRepo();
		const base = commit(repo, "chore: base", "Dev Eloper <dev@example.com>");
		commit(repo, "feat: from a fork", "Fork Person <fork@example.org>", {
			author: "Fork Person <fork@example.org>",
		});
		expect(check(repo, `${base}..HEAD`).status).toBe(0);
	});

	it("reports every offending commit, not just the first", () => {
		const repo = makeRepo();
		const base = commit(repo, "chore: base", "Dev Eloper <dev@example.com>");
		const first = commit(repo, "feat: first unsigned");
		const second = commit(repo, "feat: second unsigned");
		const result = check(repo, `${base}..HEAD`);
		expect(result.status).toBe(1);
		expect(result.output).toContain(first.slice(0, 7));
		expect(result.output).toContain(second.slice(0, 7));
	});

	it("skips merge commits, which GitHub creates without a sign-off", () => {
		const repo = makeRepo();
		const base = commit(repo, "chore: base", "Dev Eloper <dev@example.com>");
		git(repo, "checkout", "-q", "-b", "feature");
		commit(repo, "feat: on a branch", "Dev Eloper <dev@example.com>", {
			file: "feature.txt",
		});
		git(repo, "checkout", "-q", "main");
		commit(repo, "feat: on main", "Dev Eloper <dev@example.com>");
		git(
			repo,
			"merge",
			"-q",
			"--no-ff",
			"-m",
			"Merge branch 'feature'",
			"feature",
		);
		expect(check(repo, `${base}..HEAD`).status).toBe(0);
	});

	it("does not let a commit with no author email through unsigned", () => {
		// Empty author and no trailers both reduce to "", and `grep -Fx ""` matches an empty
		// line. Git itself accepts `-c user.email=` and `fsck --strict` passes such a commit.
		const repo = makeRepo();
		const base = commit(repo, "chore: base", "Dev Eloper <dev@example.com>");
		writeFileSync(path.join(repo, "file.txt"), "no email\n");
		git(repo, "add", "file.txt");
		git(
			repo,
			"-c",
			"user.email=",
			"commit",
			"-q",
			"-m",
			"feat: anonymous and unsigned",
		);
		const result = check(repo, `${base}..HEAD`);
		expect(result.status).toBe(1);
		expect(result.output).toContain("feat: anonymous and unsigned");
	});

	it("does not accept an empty sign-off email as a match", () => {
		const repo = makeRepo();
		const base = commit(repo, "chore: base", "Dev Eloper <dev@example.com>");
		writeFileSync(path.join(repo, "file.txt"), "empty signoff\n");
		git(repo, "add", "file.txt");
		git(
			repo,
			"-c",
			"user.email=",
			"commit",
			"-q",
			"-m",
			"feat: empty sign-off\n\nSigned-off-by: Someone <>",
		);
		expect(check(repo, `${base}..HEAD`).status).toBe(1);
	});

	it("passes for an empty range", () => {
		const repo = makeRepo();
		commit(repo, "chore: base", "Dev Eloper <dev@example.com>");
		const result = check(repo, "HEAD..HEAD");
		expect(result.status).toBe(0);
		expect(result.output).toContain("0 commits");
	});

	it("exits 2 with usage when no range is given", () => {
		const repo = makeRepo();
		commit(repo, "chore: base", "Dev Eloper <dev@example.com>");
		const result = check(repo);
		expect(result.status).toBe(2);
		expect(result.output).toContain("usage");
	});
});
