import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

/** Entries of a workflow's top-level `env:` block, read line by line (no backtracking). */
function topLevelEnv(yaml: string): string[] {
	const lines = yaml.split("\n");
	const start = lines.findIndex((line) => /^env:\s*$/.test(line));
	if (start === -1) return [];
	const entries: string[] = [];
	for (const line of lines.slice(start + 1)) {
		if (line.trim() === "") continue;
		if (!/^\s/.test(line)) break; // the next top-level key
		entries.push(line.trim());
	}
	return entries;
}

// Card Ledger promises no telemetry and no calls to external services. The Prisma CLI pings
// checkpoint.prisma.io (usage and update check) on every command unless CHECKPOINT_DISABLE
// is set; `prisma generate` creates its checkpoint cache when it is not. Verified by running
// the CLI with and without the variable and watching for that cache file.
describe("the Prisma CLI's checkpoint ping is disabled everywhere the CLI runs", () => {
	it("in every stage of the image, including the build stage that runs prisma generate", () => {
		const dockerfile = read("Dockerfile");
		const base = dockerfile.indexOf("AS base");
		const nextStage = dockerfile.indexOf("\nFROM ", base);
		expect(base).toBeGreaterThan(-1);
		const baseStage = dockerfile.slice(base, nextStage);
		expect(baseStage).toMatch(/CHECKPOINT_DISABLE=1/);
		// ...so it is inherited by `build`, which is where `prisma generate` runs.
		expect(dockerfile).toMatch(/FROM (deps|base) AS build|FROM deps AS build/);
	});

	it("in CI", () => {
		for (const file of [
			".github/workflows/ci.yml",
			".github/workflows/backup-drill.yml",
		]) {
			expect(topLevelEnv(read(file)), file).toContain(
				'CHECKPOINT_DISABLE: "1"',
			);
		}
	});

	it("in the package.json scripts that run the CLI", () => {
		const scripts = JSON.parse(read("package.json")).scripts as Record<
			string,
			string
		>;
		const prismaScripts = Object.entries(scripts).filter(([, command]) =>
			/\bprisma\b/.test(command),
		);
		expect(prismaScripts.length).toBeGreaterThan(0);
		for (const [name, command] of prismaScripts) {
			expect(command, name).toContain("CHECKPOINT_DISABLE=1");
		}
	});

	it("when the test suite migrates its database", () => {
		expect(read("src/test/global-setup.ts")).toMatch(/CHECKPOINT_DISABLE/);
	});

	it("in the documented development environment", () => {
		expect(read("CONTRIBUTING.md")).toContain("CHECKPOINT_DISABLE=1");
	});
});
