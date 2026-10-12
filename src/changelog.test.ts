import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The release notes are what a stranger reads before running software that holds their
// financial data. They must name the limits the project's own audit document records, in the
// reader's terms, and stay linked from the README.
const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const changelog = read("CHANGELOG.md");

function section(heading: RegExp) {
	const match = heading.exec(changelog);
	expect(match, `${heading} heading`).not.toBeNull();
	const rest = changelog.slice(match?.index ?? 0);
	// A section runs to the next heading of the same or a higher level.
	const level = rest.match(/^#+/)?.[0].length ?? 1;
	const firstLineEnd = rest.indexOf("\n") + 1;
	const next = rest
		.slice(firstLineEnd)
		.search(new RegExp(`^#{1,${level}} `, "m"));
	return next === -1 ? rest : rest.slice(0, firstLineEnd + next);
}

describe("CHANGELOG.md", () => {
	it("has a section for 0.1.0, the first public release", () => {
		expect(changelog).toMatch(/^## .*0\.1\.0/m);
	});

	it("says what the software is and that it is pre-1.0", () => {
		const notes = section(/^## .*0\.1\.0/m);
		expect(notes).toMatch(/pre-1\.0/i);
		expect(notes).toMatch(/self-host/i);
	});

	it("names every known limit before the reader runs it", () => {
		const limits = section(/^### Known limitations/m);
		for (const needle of [
			/independent/i, // not independently audited
			/SIGNUP_MODE=open/, // reminders to unverified addresses
			/unbounded/i, // the statements list is not paginated
			/PostgreSQL major/i, // restores across majors untested
			/reverse proxy|Caddy/i, // examples untested
			/only account/i, // deleting the only account re-opens registration
		]) {
			expect(limits, String(needle)).toMatch(needle);
		}
	});

	it("says how to report a vulnerability privately", () => {
		const reporting = section(/^### Reporting problems/m);
		expect(reporting).toContain("SECURITY.md");
		expect(reporting).toMatch(/private/i);
	});

	it("states the licence and the sign-off rule", () => {
		const licence = section(/^### Licence/m);
		expect(licence).toContain("AGPL-3.0-only");
		expect(licence).toMatch(/DCO|sign-off/i);
	});

	it("is linked from the README", () => {
		expect(read("README.md")).toMatch(/\]\(\.\/CHANGELOG\.md\)/);
	});

	it("says the application caps request bodies, and no longer lists that as a limit", () => {
		expect(changelog).toMatch(/1 MiB/);
		const limits = section(/^### Known limitations/m);
		expect(limits).not.toMatch(/request body/i);
		expect(limits).not.toMatch(/first-user race/i);
	});

	it("repeats nothing the audit document lists as fixed as if it were open", () => {
		// What the audit still lists as open must be in the limitations, and what it lists as
		// fixed must not be; this keeps the two documents from drifting apart.
		const audit = read("docs/pre-publication-audit.md");
		const start = audit.indexOf("**Open (reviewed, not fixed):**");
		const end = audit.indexOf("**Looked at", start);
		expect(start).toBeGreaterThan(-1);
		const open = audit.slice(start, end);
		expect(open).toContain("SIGNUP_MODE=open");
		expect(open).not.toMatch(/request body/i);
	});
});

describe("what the release notes say about the audit and the date", () => {
	// The notes quote how many findings the audit fixed. That number is a count of the rows in the
	// audit's Fixed table, so it is computed, not remembered: a new fix without a new number (or
	// the other way round) fails here instead of shipping a stale claim.
	const audit = read("docs/pre-publication-audit.md");
	const fixedTable = audit.slice(
		audit.indexOf("**Fixed:**"),
		audit.indexOf("**Checked, no findings:**"),
	);
	const fixed = fixedTable
		.split("\n")
		.filter(
			(line) => line.startsWith("|") && /`[0-9a-f]{7}`/.test(line),
		).length;

	it("counts the fixed findings in the audit's table", () => {
		expect(fixed).toBeGreaterThan(30);
	});

	it("quotes that number in the release notes", () => {
		expect(changelog).toContain(`the audit lists ${fixed} fixed findings`);
	});

	it("quotes it in the audit's own summary row", () => {
		expect(audit).toContain(`done: ${fixed} findings fixed`);
	});

	it("quotes it in the roadmap's audit row", () => {
		expect(read("docs/roadmap.md")).toContain(
			`${fixed} findings fixed with tests`,
		);
	});

	it("dates the 0.1.0 release", () => {
		const heading = changelog.match(/^## .*0\.1\.0.*$/m)?.[0] ?? "";
		expect(heading).toMatch(/\d{4}-\d{2}-\d{2}/);
		expect(heading).not.toMatch(/unreleased/i);
	});
});
