import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function walk(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const full = path.join(dir, name);
		return statSync(full).isDirectory() ? walk(full) : [full];
	});
}

// "Today" and every date-only default must come from the user's own time zone setting (the
// server computes it). `Intl.DateTimeFormat().resolvedOptions().timeZone` is the *runtime's*
// zone: UTC while rendering on the server in a container, the browser's on the client. For a
// user in Kathmandu between 00:00 and 05:45 it is yesterday, and the two renders can differ.
describe("user-facing code", () => {
	const files = [
		...walk(path.join(root, "src", "routes")),
		...walk(path.join(root, "src", "components")),
		...walk(path.join(root, "src", "features")).filter((f) =>
			f.includes(`${path.sep}components${path.sep}`),
		),
	].filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

	it("covers the UI files", () => {
		expect(files.length).toBeGreaterThan(10);
	});

	it("never derives a date from the runtime's time zone", () => {
		const offenders = files.filter((file) =>
			/resolvedOptions\(\)\s*\.\s*timeZone/.test(readFileSync(file, "utf8")),
		);
		expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
	});
});
