import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { EXCEPTIONS } from "../scripts/license-policy";

const root = process.cwd();
const tsx = path.join(root, "node_modules", ".bin", "tsx");

describe("npm run licenses:check (the real installed production tree)", () => {
	const result = spawnSync(tsx, ["scripts/check-licenses.ts"], {
		cwd: root,
		encoding: "utf8",
		timeout: 120_000,
	});
	const output = `${result.stdout}${result.stderr}`;

	it("finds no licence that is incompatible with AGPL-3.0-only or unreviewed", () => {
		expect(output).toContain("0 failing");
		expect(result.status).toBe(0);
	});

	it("lists the reviewed exceptions explicitly", () => {
		expect(output).toMatch(/exception\s+elkjs@/);
	});

	it("keeps no exception for a package that is no longer installed", () => {
		// An exception for a package that has left the tree would excuse it silently if it
		// ever came back, so each one must be needed by something installed today.
		for (const name of Object.keys(EXCEPTIONS)) {
			expect(output, `stale exception: ${name}`).toMatch(
				new RegExp(`exception\\s+${name}@`),
			);
		}
	});

	it("covers a realistic number of packages", () => {
		const count = Number(output.match(/(\d+) packages/)?.[1] ?? 0);
		expect(count).toBeGreaterThan(200);
	});
});
