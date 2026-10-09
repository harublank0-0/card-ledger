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
