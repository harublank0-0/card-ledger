import { describe, expect, it } from "vitest";

import { Route as cards } from "./_authed/cards/index";
import { Route as categories } from "./_authed/categories";
import { Route as subscriptions } from "./_authed/subscriptions/index";
import { Route as signIn } from "./sign-in";

type Parsed = Record<string, unknown>;
type SearchValidator =
	| ((input: Parsed) => Parsed)
	| { parse: (input: unknown) => Parsed };

// A route's `validateSearch` is either a function or the Zod schema itself.
const validate =
	(route: { options: { validateSearch?: unknown } }) =>
	(input: Parsed): Parsed => {
		const v = route.options.validateSearch as SearchValidator;
		return typeof v === "function" ? v(input) : v.parse(input);
	};

// Search parameters are typed by hand in the address bar. A value that does not fit is
// ignored, not an error page.
describe("the archived flag", () => {
	it.each([
		["cards", cards],
		["categories", categories],
		["subscriptions", subscriptions],
	] as const)("is ignored when malformed on %s", (_name, route) => {
		for (const bad of ["abc", 5, "1", ["true"], {}]) {
			expect(validate(route)({ archived: bad }).archived).toBeUndefined();
		}
		expect(validate(route)({ archived: true }).archived).toBe(true);
	});
});

describe("sign-in search", () => {
	it("ignores a redirect that is not a string", () => {
		for (const bad of [123, true, ["/x"], { a: 1 }]) {
			expect(validate(signIn)({ redirect: bad }).redirect).toBeUndefined();
		}
		expect(validate(signIn)({ redirect: "/cards" }).redirect).toBe("/cards");
	});
});
