import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const lines = (file: string) =>
	readFileSync(path.join(process.cwd(), file), "utf8")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#"));

describe("files that can hold real financial data or secrets", () => {
	it("keeps database backups out of git and out of the image build context", () => {
		// scripts/backup.sh writes full database dumps to ./backups by default.
		expect(lines(".gitignore")).toContain("backups");
		expect(lines(".dockerignore")).toContain("backups");
	});

	it("keeps env files out of git and out of the image build context", () => {
		expect(lines(".gitignore")).toContain(".env");
		expect(lines(".gitignore")).toContain("*.local");
		expect(lines(".dockerignore")).toContain(".env");
		expect(lines(".dockerignore")).toContain(".env.*");
	});
});

describe("what git ignores (behaviour, via `git check-ignore`)", () => {
	const ignored = (file: string) => {
		try {
			execFileSync("git", ["check-ignore", "-q", file], {
				cwd: process.cwd(),
				stdio: "ignore",
			});
			return true;
		} catch {
			return false;
		}
	};

	it.each([
		".env",
		".env.local",
		".env.production",
		".env.staging",
		"nested/.env.production",
		"backups/card-ledger-20261010T000000Z-01.dump",
		"card-ledger-copy.dump",
		"restore-test.dump.age",
		".output/server/index.mjs",
		"src/generated/prisma/client.ts",
	])("ignores %s", (file) => {
		expect(ignored(file)).toBe(true);
	});

	it("still tracks the example environment file", () => {
		expect(ignored(".env.example")).toBe(false);
	});
});

describe("scaffold leftovers", () => {
	it("keeps no unused starter assets", () => {
		expect(existsSync(path.join(process.cwd(), "public", "prisma.svg"))).toBe(
			false,
		);
	});

	it("keeps no pnpm advice that contradicts the project's package manager", () => {
		const rules = path.join(process.cwd(), ".cursorrules");
		if (existsSync(rules)) {
			expect(readFileSync(rules, "utf8")).not.toMatch(/pnpm/);
		}
	});
});
