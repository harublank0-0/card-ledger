import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => {
	const full = path.join(root, file);
	expect(existsSync(full), file).toBe(true);
	return readFileSync(full, "utf8");
};

const REPOSITORY = "github.com/haruBlank0-0/card-ledger";

describe("issue template chooser", () => {
	const config = read(".github/ISSUE_TEMPLATE/config.yml");

	it("disables blank issues so every report uses a form", () => {
		expect(config).toMatch(/^blank_issues_enabled:\s*false\s*$/m);
	});

	it("sends vulnerabilities to the private advisory form", () => {
		expect(config).toContain(`${REPOSITORY}/security/advisories/new`);
	});

	it("points installers at the troubleshooting guide", () => {
		expect(config).toContain("docs/self-hosting.md#troubleshooting");
	});
});

describe.each([
	["bug_report.yml", "Bug report"],
	["feature_request.yml", "Feature request"],
])("issue form %s", (file, title) => {
	const form = read(`.github/ISSUE_TEMPLATE/${file}`);

	it("is a GitHub issue form with a name, description and body", () => {
		expect(form).toMatch(new RegExp(`^name:\\s*${title}\\s*$`, "m"));
		expect(form).toMatch(/^description:\s*\S/m);
		expect(form).toMatch(/^body:\s*$/m);
	});

	it("opens with a warning not to paste real financial data or secrets", () => {
		const firstBlock = form.split(/^\s*-\s*type:/m)[1] ?? "";
		expect(firstBlock).toMatch(/^\s*markdown/);
		expect(firstBlock).toMatch(/real financial data/i);
		expect(firstBlock).toMatch(/backup/i);
		expect(firstBlock).toMatch(/\.env/);
	});

	it("makes the reporter confirm the data was cleaned", () => {
		expect(form).toMatch(/type:\s*checkboxes/);
		expect(form).toMatch(/required:\s*true/);
	});
});

describe("bug report form", () => {
	const form = read(".github/ISSUE_TEMPLATE/bug_report.yml");

	it("asks for what is needed to reproduce", () => {
		for (const needle of [
			"Version or commit",
			"docker compose logs",
			"Docker Compose",
			"pnpm run dev",
		]) {
			expect(form, needle).toContain(needle);
		}
	});

	it("keeps reporters away from the public tracker for vulnerabilities", () => {
		expect(form).toContain("SECURITY.md");
	});
});

describe("pull request template", () => {
	const template = read(".github/pull_request_template.md");

	it("has a checklist", () => {
		expect((template.match(/^- \[ \]/gm) ?? []).length).toBeGreaterThanOrEqual(
			6,
		);
	});

	it("covers the rules a reviewer enforces", () => {
		for (const needle of [
			"git commit -s",
			"synthetic",
			"pnpm run check",
			"pnpm run typecheck",
			"pnpm test",
			"cross-user",
			"docs/roadmap.md",
			"AGPL-3.0-only",
			"telemetry",
		]) {
			expect(template, needle).toContain(needle);
		}
	});
});
