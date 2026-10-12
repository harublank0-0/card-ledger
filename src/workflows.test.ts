import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Properties promised by docs/decisions/0009-ci-minimal-pinned-secret-free.md.
const dir = path.join(process.cwd(), ".github", "workflows");
const files = existsSync(dir)
	? readdirSync(dir).filter((name) => /\.ya?ml$/.test(name))
	: [];
const workflows = files.map((name) => ({
	name,
	text: readFileSync(path.join(dir, name), "utf8"),
}));

describe("GitHub Actions workflows", () => {
	it("exist", () => {
		expect(files).toContain("ci.yml");
		expect(files).toContain("backup-drill.yml");
	});

	it("pin every action to a full commit SHA", () => {
		for (const { name, text } of workflows) {
			const uses = [...text.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map(
				(match) => match[1],
			);
			expect(uses.length, name).toBeGreaterThan(0);
			for (const reference of uses) {
				expect(reference, `${name}: ${reference}`).toMatch(
					/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/,
				);
			}
		}
	});

	it("use only first-party actions", () => {
		for (const { name, text } of workflows) {
			for (const match of text.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)) {
				expect(match[1], name).toMatch(/^actions\//);
			}
		}
	});

	it("pin the runner image instead of following ubuntu-latest", () => {
		// `ubuntu-latest` moves to a new OS release on GitHub's schedule (24.04 to 26 in
		// October 2026), changing the pipeline without a commit. The label is the image the
		// workflows were last seen passing on; moving it is a deliberate change. The `-arm`
		// suffix is GitHub's native arm64 runner for the same release.
		const pinned = /^ubuntu-\d{2}\.\d{2}(-arm)?$/;
		for (const { name, text } of workflows) {
			const labels = [...text.matchAll(/^\s*runs-on:\s*(.+?)\s*$/gm)].map(
				(match) => match[1],
			);
			expect(labels.length, name).toBeGreaterThan(0);
			const matrixRunners = [
				...text.matchAll(/^\s*(?:-\s*)?runner:\s*(\S+)/gm),
			].map((match) => match[1]);
			for (const label of labels) {
				if (label.startsWith("${{")) {
					expect(label, `${name}: ${label}`).toBe("${{ matrix.runner }}");
					expect(
						matrixRunners.length,
						`${name}: matrix runners`,
					).toBeGreaterThan(0);
				} else {
					expect(label, `${name}: ${label}`).toMatch(pinned);
				}
			}
			for (const runner of matrixRunners) {
				expect(runner, `${name}: matrix runner ${runner}`).toMatch(pinned);
			}
		}
	});

	it("grant read-only repository access", () => {
		for (const { name, text } of workflows) {
			expect(text, name).toMatch(/^permissions:\s*\n\s+contents:\s*read\s*$/m);
		}
	});

	it("do not persist the checkout token", () => {
		for (const { name, text } of workflows) {
			const checkouts = (text.match(/actions\/checkout@/g) ?? []).length;
			const safe = (text.match(/persist-credentials:\s*false/g) ?? []).length;
			expect(safe, name).toBeGreaterThanOrEqual(checkouts);
		}
	});

	it("need no repository secrets and never run untrusted code with them", () => {
		for (const { name, text } of workflows) {
			expect(text, name).not.toMatch(/\$\{\{\s*secrets\./);
			expect(text, name).not.toMatch(/pull_request_target/);
		}
	});

	it("keep event values out of inline shell scripts", () => {
		for (const { name, text } of workflows) {
			// `${{ github.event... }}` is allowed in env: and with: values, not inside run: steps.
			const runLines = text
				.split("\n")
				.filter((line) => /^\s*(-\s*)?run:/.test(line));
			for (const line of runLines) {
				expect(line, name).not.toMatch(/\$\{\{\s*github\.(event|head_ref)/);
			}
		}
	});
});

describe("documents that tell the maintainer which checks to require", () => {
	// GitHub's required-status-check picker lists a check by its job *name* ("DCO sign-off"),
	// not by the job id in the workflow (`dco`). The documents must use what the maintainer
	// will actually see, and the names must be the ones in ci.yml.
	const ci =
		workflows.find((workflow) => workflow.name === "ci.yml")?.text ?? "";
	const names = Object.fromEntries(
		[...ci.matchAll(/^ {2}(verify|dco|docker):\n {4}name: (.+)$/gm)].map(
			(match) => [match[1], match[2].trim()],
		),
	);

	const requirementLines = (file: string) =>
		readFileSync(path.join(process.cwd(), file), "utf8")
			.split("\n")
			.filter(
				(line) =>
					/branch protection|protect `main`/i.test(line) &&
					/requir/i.test(line),
			);

	it("reads the three display names from ci.yml", () => {
		expect(names).toEqual({
			verify: expect.any(String),
			dco: expect.any(String),
			docker: expect.any(String),
		});
	});

	it.each([
		"docs/pre-publication-audit.md",
		"docs/decisions/0009-ci-minimal-pinned-secret-free.md",
	])("%s names the checks by their display names, not their job ids", (file) => {
		const lines = requirementLines(file);
		expect(lines.length, file).toBeGreaterThan(0);
		for (const line of lines) {
			for (const name of Object.values(names)) {
				expect(line, `${file}: ${name}`).toContain(name);
			}
			expect(line, file).not.toMatch(/`(verify|dco|docker)`/);
		}
	});

	it("the roadmap's CI row names them too", () => {
		const lines = requirementLines("docs/roadmap.md");
		expect(lines.length).toBeGreaterThan(0);
		for (const line of lines) {
			for (const name of Object.values(names)) expect(line).toContain(name);
		}
	});
});

describe("image workflows", () => {
	// A published image is something other people run with their financial data, so the
	// workflow that pushes one is held to more than the others: it runs on version tags only, it
	// is the only place that may write packages, and it never moves a floating tag.
	const publish = readFileSync(path.join(dir, "publish-image.yml"), "utf8");
	const check = readFileSync(path.join(dir, "image-check.yml"), "utf8");
	const withoutComments = (text: string) =>
		text
			.split("\n")
			.filter((line) => !/^\s*#/.test(line))
			.join("\n");

	it("publishes only when a version tag is pushed", () => {
		expect(publish).toMatch(/^on:\n {2}push:\n {4}tags:/m);
		expect(publish).not.toMatch(/pull_request|workflow_dispatch|branches:/);
	});

	it("keeps the check free of registry access and of write permission", () => {
		const body = withoutComments(check);
		expect(body).not.toMatch(/packages:\s*write/);
		expect(body).not.toMatch(/docker (login|push)|imagetools/);
		expect(body).not.toMatch(/pull_request_target/);
	});

	it("grants packages: write to jobs of the publish workflow only", () => {
		for (const { name, text } of workflows) {
			const count = (text.match(/packages:\s*write/g) ?? []).length;
			if (name === "publish-image.yml") {
				expect(count, name).toBeGreaterThanOrEqual(2);
				// Never at the top level: the top-level permissions stay read-only.
				expect(text, name).toMatch(
					/^permissions:\n\s+contents:\s*read\s*\n(?!\s+packages)/m,
				);
			} else {
				expect(count, name).toBe(0);
			}
		}
	});

	it("never publishes a floating latest tag", () => {
		expect(withoutComments(publish)).not.toMatch(/latest/i);
	});

	it("takes the tag name from the environment and checks that it is a version", () => {
		for (const line of publish.split("\n")) {
			if (line.includes("github.ref_name")) {
				expect(line).toMatch(
					/^\s+[A-Z_]+:\s*\$\{\{\s*github\.ref_name\s*\}\}\s*$/,
				);
			}
		}
		expect(publish).toMatch(/\^v\[0-9\]\+\\\.\[0-9\]\+\\\.\[0-9\]\+\$/);
	});

	it("builds both architectures natively and merges them into one tag", () => {
		expect(publish).toContain("ubuntu-24.04-arm");
		expect(publish).toMatch(/runner:\s*ubuntu-24\.04\s*$/m);
		expect(publish).toContain("docker buildx imagetools create");
		expect(publish).toContain("linux/amd64");
		expect(publish).toContain("linux/arm64");
	});

	it("builds and tests the image the same way in both workflows", () => {
		for (const [name, text] of [
			["publish-image.yml", publish],
			["image-check.yml", check],
		] as const) {
			expect(text, name).toContain("sh scripts/build-image.sh");
			expect(text, name).toMatch(/SMOKE_IMAGE=/);
			expect(text, name).toContain("sh scripts/docker-smoke.sh");
		}
	});

	it("logs in with the job's own token, never a stored secret", () => {
		expect(publish).toContain("github.token");
		expect(publish).toContain("--password-stdin");
		expect(publish).not.toMatch(/secrets\./);
	});
});
