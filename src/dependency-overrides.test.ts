import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Two transitive dependencies of the Prisma CLI (prisma@7.10.0 pins mysql2 exactly and
// @prisma/config uses deepmerge-ts 7.x) carry high-severity `npm audit` advisories. Prisma has
// no newer stable 7.x release, so `package.json` overrides them to patched versions. This test
// keeps the overrides from being dropped by an unrelated `npm install` or a dependency bot,
// and says when they can go.
//
//   mysql2       GHSA-3f6p-5ww8-9rcr, GHSA-rgwj-5xj2-c3m3   fixed in 3.24.x
//   deepmerge-ts GHSA-ggr8-5vv4-36mx                        fixed in 8.0.0
//
// Remove the overrides (and this test) when Prisma itself ships dependencies at or above
// these versions: then `npm audit --omit=dev` is clean without them.
const root = process.cwd();
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const lock = JSON.parse(
	readFileSync(path.join(root, "package-lock.json"), "utf8"),
);

function atLeast(version: string, minimum: [number, number, number]) {
	const parts = version.split(".").map((part) => Number.parseInt(part, 10));
	for (let index = 0; index < 3; index++) {
		const have = parts[index] ?? 0;
		const need = minimum[index] ?? 0;
		if (have !== need) return have > need;
	}
	return true;
}

describe("overrides for audited transitive dependencies", () => {
	it("keeps mysql2 at a patched release in the lockfile", () => {
		const entry = lock.packages["node_modules/mysql2"];
		expect(entry, "mysql2 in package-lock.json").toBeDefined();
		expect(atLeast(entry.version, [3, 24, 0]), entry.version).toBe(true);
	});

	it("keeps deepmerge-ts at a patched release in the lockfile", () => {
		const entry = lock.packages["node_modules/deepmerge-ts"];
		expect(entry, "deepmerge-ts in package-lock.json").toBeDefined();
		expect(atLeast(entry.version, [8, 0, 0]), entry.version).toBe(true);
	});

	it("declares both overrides in package.json", () => {
		expect(pkg.overrides?.mysql2).toMatch(/^\^?3\.(2[4-9]|[3-9]\d)\./);
		expect(pkg.overrides?.["deepmerge-ts"]).toMatch(/^\^?(8|9|\d{2,})\./);
	});

	it("overrides nothing else", () => {
		expect(Object.keys(pkg.overrides ?? {}).sort()).toEqual([
			"deepmerge-ts",
			"mysql2",
		]);
	});
});
