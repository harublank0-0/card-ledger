import { describe, expect, it } from "vitest";

import { safeRedirect } from "./redirect";

describe("safeRedirect", () => {
	it("lands on the dashboard by default", () => {
		expect(safeRedirect(undefined)).toBe("/");
		expect(safeRedirect("")).toBe("/");
	});
	it("keeps same-site paths, including their query", () => {
		expect(safeRedirect("/transactions")).toBe("/transactions");
		expect(safeRedirect("/statements?paid=true")).toBe("/statements?paid=true");
	});
	it("refuses anything that could leave the site", () => {
		for (const bad of [
			"//evil.example",
			"https://evil.example",
			"javascript:alert(1)",
			"evil",
		]) {
			expect(safeRedirect(bad)).toBe("/");
		}
	});
});

// The oracle is the browser's own URL parser: whatever safeRedirect returns, resolving it
// against the site must stay on the site. Browsers read a backslash as a slash and drop tabs
// and newlines inside a URL, so "/\\evil.example" and "/\t/evil.example" both become
// "//evil.example".
describe("safeRedirect against the URL parser", () => {
	const ORIGIN = "http://app.example";
	const hostile = [
		"/\\evil.example",
		"/\\\\evil.example",
		"/\t/evil.example",
		"/\n/evil.example",
		"/\r/evil.example",
		"/\u0000/evil.example",
		"//evil.example",
		"///evil.example",
		"/ /evil.example",
		"https://evil.example",
		"http:evil.example",
		"\\\\evil.example",
		"/\\/evil.example",
	];

	it.each(hostile)("keeps %j on the site", (input) => {
		const result = safeRedirect(input);
		expect(new URL(result, ORIGIN).origin).toBe(ORIGIN);
	});

	it("still allows ordinary paths with queries and encoded characters", () => {
		for (const ok of [
			"/subscriptions?archived=true",
			"/statements?cardId=01a1265d-0980-72ad-a375-fcae3345ef5a",
			"/transactions?from=2026-01-01&to=2026-01-31",
			"/cards/%5Cname",
		]) {
			expect(safeRedirect(ok)).toBe(ok);
		}
	});
});
