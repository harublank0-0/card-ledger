import { describe, expect, it } from "vitest";

import { isSignupAllowed } from "./signup-policy";

describe("isSignupAllowed", () => {
	it("first-user allows only the first account", () => {
		expect(isSignupAllowed("first-user", 0)).toBe(true);
		expect(isSignupAllowed("first-user", 1)).toBe(false);
	});

	it("open always allows", () => {
		expect(isSignupAllowed("open", 0)).toBe(true);
		expect(isSignupAllowed("open", 50)).toBe(true);
	});

	it("closed never allows", () => {
		expect(isSignupAllowed("closed", 0)).toBe(false);
	});
});
