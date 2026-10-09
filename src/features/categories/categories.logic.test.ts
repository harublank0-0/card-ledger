import { describe, expect, it } from "vitest";

import {
	DEFAULT_CATEGORY_NAMES,
	normalizeCategoryName,
	SUBSCRIPTIONS_CATEGORY_NAME,
	sameCategoryName,
} from "./categories.logic";

describe("category names", () => {
	it("normalises whitespace", () => {
		expect(normalizeCategoryName("  Eating   out ")).toBe("Eating out");
	});
	it("compares case-insensitively after normalising", () => {
		expect(sameCategoryName("Groceries", "  groceries ")).toBe(true);
		expect(sameCategoryName("Eating out", "eating   OUT")).toBe(true);
		expect(sameCategoryName("Travel", "Transport")).toBe(false);
	});
	it("has unique defaults including the subscriptions category", () => {
		expect(new Set(DEFAULT_CATEGORY_NAMES).size).toBe(
			DEFAULT_CATEGORY_NAMES.length,
		);
		expect(DEFAULT_CATEGORY_NAMES).toContain(SUBSCRIPTIONS_CATEGORY_NAME);
	});
});
