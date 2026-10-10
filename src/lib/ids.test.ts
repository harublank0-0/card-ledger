import { describe, expect, it } from "vitest";

import { isUuid } from "./ids";

describe("isUuid", () => {
	it("accepts a UUID, in either case", () => {
		expect(isUuid("01a1265d-0980-72ad-a375-fcae3345ef5a")).toBe(true);
		expect(isUuid("01A1265D-0980-72AD-A375-FCAE3345EF5A")).toBe(true);
	});

	it.each([
		"",
		"abc",
		"123",
		"../etc/passwd",
		"01a1265d-0980-72ad-a375",
		" 01a1265d-0980-72ad-a375-fcae3345ef5a",
	])("rejects %j", (value) => {
		expect(isUuid(value)).toBe(false);
	});
});
