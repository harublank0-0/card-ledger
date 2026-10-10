import { describe, expect, it } from "vitest";

type RouteModule = {
	Route?: {
		options: {
			component?: unknown;
			head?: () => { meta?: Array<{ title?: string }> };
		};
	};
};

// Every page names itself, so the tab, the history and a screen reader's page announcement
// say where the person is. Layout routes only wrap their children and are exempt.
const modules = import.meta.glob<RouteModule>(
	["./**/*.tsx", "!./__root.tsx", "!./**/*.test.tsx"],
	{ eager: true },
);
const LAYOUTS = new Set(["./_authed.tsx"]);

describe("page titles", () => {
	const pages = Object.entries(modules).filter(
		([file, mod]) => mod.Route?.options.component && !LAYOUTS.has(file),
	);

	it("finds the pages", () => {
		expect(pages.length).toBeGreaterThanOrEqual(12);
	});

	it.each(pages.map(([file]) => file))("%s sets a title", (file) => {
		const title = modules[file]?.Route?.options
			.head?.()
			.meta?.find((m) => m.title)?.title;
		expect(title).toBeTruthy();
		expect(title).toMatch(/ · Card Ledger$/);
	});

	it("gives every page its own title", () => {
		const titles = pages.map(
			([, mod]) =>
				mod.Route?.options.head?.().meta?.find((m) => m.title)?.title,
		);
		expect(new Set(titles).size).toBe(titles.length);
	});
});
