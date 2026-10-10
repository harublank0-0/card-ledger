import { describe, expect, it } from "vitest";

import { RouteError, RouteNotFound } from "#/components/route-fallbacks";
import { getRouter } from "./router";

describe("router defaults", () => {
	// Without these a bad URL or a failed loader falls through to the framework's own screen,
	// which is unstyled and, for errors, prints the raw message.
	it("shows the app's own error and not-found screens", () => {
		const router = getRouter();
		expect(router.options.defaultErrorComponent).toBe(RouteError);
		expect(router.options.defaultNotFoundComponent).toBe(RouteNotFound);
	});
});
