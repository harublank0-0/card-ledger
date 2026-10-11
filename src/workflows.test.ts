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
		// workflows were last seen passing on; moving it is a deliberate change.
		for (const { name, text } of workflows) {
			const labels = [...text.matchAll(/^\s*runs-on:\s*(\S+)/gm)].map(
				(match) => match[1],
			);
			expect(labels.length, name).toBeGreaterThan(0);
			for (const label of labels) {
				expect(label, `${name}: ${label}`).toMatch(/^ubuntu-\d{2}\.\d{2}$/);
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
