import { describe, expect, it, vi } from "vitest";

import { renderWithRouter } from "#/test/render";
import { RouteError, RouteNotFound } from "./route-fallbacks";

describe("RouteNotFound", () => {
	it("says the page does not exist and links home", async () => {
		const html = await renderWithRouter(<RouteNotFound />);
		expect(html).toContain("Page not found");
		expect(html).toMatch(/<a [^>]*href="\/"/);
	});
});

describe("RouteError", () => {
	it("shows a message the application wrote", async () => {
		const html = await renderWithRouter(
			<RouteError
				error={new Error("Subscription not found")}
				reset={vi.fn()}
			/>,
		);
		expect(html).toContain("Subscription not found");
		expect(html).toContain("Try again");
	});

	it("hides the text of an unexpected error", async () => {
		const html = await renderWithRouter(
			<RouteError
				error={new TypeError("connect ECONNREFUSED 10.0.0.5:5432")}
				reset={vi.fn()}
			/>,
		);
		expect(html).not.toContain("ECONNREFUSED");
		expect(html).not.toContain("10.0.0.5");
		expect(html).toContain("Something went wrong");
	});

	it("is announced to assistive technology", async () => {
		const html = await renderWithRouter(
			<RouteError error={new Error("x")} reset={vi.fn()} />,
		);
		expect(html).toMatch(/role="alert"/);
	});
});
