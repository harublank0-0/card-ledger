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
	// Docker matches a pattern without `**/` only at the root of the build context, so a
	// nested `src/.env.local` or `prisma/.env` would be copied into the image.
	it("keeps database backups out of git and, at any depth, out of the image build context", () => {
		expect(lines(".gitignore")).toContain("backups");
		expect(lines(".gitignore")).toContain("*.dump");
		for (const pattern of ["**/backups", "**/*.dump", "**/*.dump.*"]) {
			expect(lines(".dockerignore"), pattern).toContain(pattern);
		}
	});

	it("keeps env files out of git and, at any depth, out of the image build context", () => {
		expect(lines(".gitignore")).toContain(".env");
		expect(lines(".gitignore")).toContain("*.local");
		for (const pattern of ["**/.env", "**/.env.*", "**/*.local"]) {
			expect(lines(".dockerignore"), pattern).toContain(pattern);
		}
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

	it("keeps no unused starter components or stubs", () => {
		const root = process.cwd();
		// A header widget that nothing renders, which also drew a user-supplied image URL.
		expect(
			existsSync(
				path.join(
					root,
					"src",
					"integrations",
					"better-auth",
					"header-user.tsx",
				),
			),
		).toBe(false);
		// The query client factory is used; the default-exported empty component was not.
		const provider = readFileSync(
			path.join(
				root,
				"src",
				"integrations",
				"tanstack-query",
				"root-provider.tsx",
			),
			"utf8",
		);
		expect(provider).not.toMatch(/export default/);
	});

	it("keeps src/lib/utils.ts, which shadcn's utils alias points at", () => {
		// Not dead code: `npx shadcn add` generates components that import `cn` from here
		// (components.json: aliases.utils). Removing it would break the next added component.
		const config = JSON.parse(
			readFileSync(path.join(process.cwd(), "components.json"), "utf8"),
		);
		expect(config.aliases.utils).toBe("#/lib/utils");
		expect(existsSync(path.join(process.cwd(), "src", "lib", "utils.ts"))).toBe(
			true,
		);
	});

	it("keeps no pnpm advice that contradicts the project's package manager", () => {
		const rules = path.join(process.cwd(), ".cursorrules");
		if (existsSync(rules)) {
			expect(readFileSync(rules, "utf8")).not.toMatch(/pnpm/);
		}
	});
});
