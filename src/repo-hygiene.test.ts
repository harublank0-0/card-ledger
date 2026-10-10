import { readFileSync } from "node:fs";
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
