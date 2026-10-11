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
			/request body/i, // no in-app size cap
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

	it("repeats nothing the audit document lists as fixed as if it were open", () => {
		// The two items the audit still lists as open must be in the limitations; this keeps the
		// two documents from drifting apart.
		const audit = read("docs/pre-publication-audit.md");
		const open = audit.slice(audit.indexOf("**Open (reviewed, not fixed):**"));
		expect(open).toContain("SIGNUP_MODE=open");
		expect(open).toMatch(/request body/i);
	});
});
