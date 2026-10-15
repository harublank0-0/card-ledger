import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// docs/releasing.md is the maintainer's checklist for cutting a release. The command that turns
// the CHANGELOG section into a release body is run here, so the document cannot drift from what
// works (a release page does not resolve relative links; this once nearly shipped broken).
const root = process.cwd();
const guide = readFileSync(path.join(root, "docs", "releasing.md"), "utf8");

function bodyCommand() {
	const block = [...guide.matchAll(/```sh\n([\s\S]*?)```/g)]
		.map((match) => match[1])
		.find((code) => code.includes("awk -v v="));
	expect(block, "a sh block with the awk body generator").toBeDefined();
	return block as string;
}

describe("docs/releasing.md", () => {
	it("is linked from CONTRIBUTING.md", () => {
		const contributing = readFileSync(
			path.join(root, "CONTRIBUTING.md"),
			"utf8",
		);
		expect(contributing).toContain("(./docs/releasing.md)");
	});

	it("tells the maintainer the order and the traps", () => {
		for (const needle of [
			"CI is green on `main`",
			"pre-release",
			"protect-release-tags",
			"relative links",
		]) {
			expect(guide, needle).toContain(needle);
		}
	});

	it("gives the tag commands as a runnable block, with the check before the tag", () => {
		const block = [...guide.matchAll(/```sh\n([\s\S]*?)```/g)]
			.map((match) => match[1])
			.find((code) => code.includes("git tag -a v"));
		expect(block, "a sh block that creates the tag").toBeDefined();
		const text = block as string;
		expect(text).toMatch(/git pull --ff-only/);
		expect(text.indexOf("git log --oneline -1")).toBeGreaterThan(-1);
		expect(text.indexOf("git log --oneline -1")).toBeLessThan(
			text.indexOf("git tag -a v"),
		);
		expect(text).toMatch(/git push origin v\d/);
	});

	it("checks that the release notes are on the checked-out commit before tagging it", () => {
		// The v0.2.0 tag was pushed before its notes were merged: the `git log` line showed the
		// previous merge commit, which looks just as right. The changelog heading cannot.
		const text =
			[...guide.matchAll(/```sh\n([\s\S]*?)```/g)]
				.map((match) => match[1])
				.find((code) => code.includes("git tag -a v")) ?? "";
		const check = text.search(/^grep .*"\^## \d+\.\d+\.\d+ — " CHANGELOG\.md/m);
		expect(check).toBeGreaterThan(-1);
		expect(check).toBeLessThan(text.indexOf("git tag -a v"));
	});

	it("no longer tells the maintainer to delete a pushed tag, which the tag ruleset blocks", () => {
		expect(guide).not.toMatch(/git push origin --delete/);
	});

	it("has a body generator that produces a release body that works on a release page", () => {
		const result = spawnSync("sh", ["-c", bodyCommand()], {
			cwd: root,
			encoding: "utf8",
		});
		expect(result.status).toBe(0);
		const body = result.stdout;
		expect(body.length).toBeGreaterThan(1000);
		expect(body).not.toMatch(/^## /m); // the heading is the release title, not the body
		expect(body).toContain("### Known limitations");
		expect(body).not.toMatch(/\]\(\.\//); // no relative links
		expect(body).toMatch(
			/\]\(https:\/\/github\.com\/haruBlank0-0\/card-ledger\/blob\/v0\.1\.0\/SECURITY\.md\)/,
		);
		expect(body).not.toContain("## 0.1.0");
	});
});
