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

const rel = (file: string) => path.relative(root, file);

// Every authenticated screen runs its mutations through `useAction` (one call at a time, the
// failure shown through the same allowlist as the server's). A hand-rolled
// `catch (e) { setError(e instanceof Error ? e.message ... }` is how a double click sent a
// mutation twice and how the cards page swallowed failures.
describe("authenticated screens", () => {
	const files = walk(path.join(root, "src", "routes", "_authed")).filter((f) =>
		/\.tsx$/.test(f),
	);

	it("covers the screens", () => {
		expect(files.length).toBeGreaterThan(10);
	});

	it("do not hand-roll error handling around server calls", () => {
		const offenders = files.filter((file) =>
			/instanceof Error\s*\?\s*e\.message/.test(readFileSync(file, "utf8")),
		);
		expect(offenders.map(rel)).toEqual([]);
	});

	it.each([
		"src/routes/_authed/cards/index.tsx",
		"src/routes/_authed/categories.tsx",
		"src/routes/_authed/settings.tsx",
		"src/routes/_authed/statements/$statementId.tsx",
		"src/routes/_authed/subscriptions/$subscriptionId.tsx",
		"src/routes/_authed/transactions/$transactionId.tsx",
	])("%s uses useAction", (file) => {
		expect(readFileSync(path.join(root, file), "utf8")).toContain(
			"useAction()",
		);
	});
});
