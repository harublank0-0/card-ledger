import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Two transitive dependencies of the Prisma CLI (prisma@7.10.0 pins mysql2 exactly and
// @prisma/config uses deepmerge-ts 7.x) carry high-severity audit advisories. Prisma has no
// newer stable 7.x release, so pnpm-workspace.yaml overrides them to patched versions. This
// test keeps the overrides from being dropped by an unrelated change or a dependency bot, and
// says when they can go.
//
//   mysql2       GHSA-3f6p-5ww8-9rcr, GHSA-rgwj-5xj2-c3m3   fixed in 3.24.x
//   deepmerge-ts GHSA-ggr8-5vv4-36mx                        fixed in 8.0.0
//
// Remove the overrides (and this test) when Prisma itself ships dependencies at or above
// these versions: then `pnpm audit --prod` is clean without them.
const root = process.cwd();
const workspace = readFileSync(path.join(root, "pnpm-workspace.yaml"), "utf8");
const lock = readFileSync(path.join(root, "pnpm-lock.yaml"), "utf8");

function atLeast(version: string, minimum: [number, number, number]) {
	const parts = version.split(".").map((part) => Number.parseInt(part, 10));
	for (let index = 0; index < 3; index++) {
		const have = parts[index] ?? 0;
		const need = minimum[index] ?? 0;
		if (have !== need) return have > need;
	}
	return true;
}

/** Every resolved version of a package named in the lockfile's package and snapshot keys. */
function lockedVersions(name: string) {
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const keys = lock.matchAll(
		new RegExp(`^ {2}'?${escaped}@(\\d+\\.\\d+\\.\\d+)`, "gm"),
	);
	return [...new Set([...keys].map((match) => match[1]))];
}

/** The `overrides:` block of pnpm-workspace.yaml as a name -> range map. */
function overrides() {
	const block = workspace.match(/^overrides:\n((?: {2}\S.*\n?)+)/m)?.[1] ?? "";
	return Object.fromEntries(
		block
			.split("\n")
			.map((line) => line.match(/^ {2}"?([^":]+)"?:\s*(.+?)\s*$/))
			.filter((match): match is RegExpMatchArray => match !== null)
			.map((match) => [match[1], match[2]]),
	);
}

describe("overrides for audited transitive dependencies", () => {
	it("keeps mysql2 at a patched release in the lockfile", () => {
		const versions = lockedVersions("mysql2");
		expect(versions.length, "mysql2 in pnpm-lock.yaml").toBeGreaterThan(0);
		for (const version of versions) {
			expect(atLeast(version, [3, 24, 0]), version).toBe(true);
		}
	});

	it("keeps deepmerge-ts at a patched release in the lockfile", () => {
		const versions = lockedVersions("deepmerge-ts");
		expect(versions.length, "deepmerge-ts in pnpm-lock.yaml").toBeGreaterThan(
			0,
		);
		for (const version of versions) {
			expect(atLeast(version, [8, 0, 0]), version).toBe(true);
		}
	});

	it("declares both overrides in pnpm-workspace.yaml", () => {
		const declared = overrides();
		expect(declared.mysql2).toMatch(/^\^?3\.(2[4-9]|[3-9]\d)\./);
		expect(declared["deepmerge-ts"]).toMatch(/^\^?(8|9|\d{2,})\./);
	});

	it("overrides nothing else", () => {
		expect(Object.keys(overrides()).sort()).toEqual(["deepmerge-ts", "mysql2"]);
	});
});
