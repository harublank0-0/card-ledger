import {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { renderToString } from "react-dom/server";

/**
 * Render a component that uses TanStack `<Link>` to static HTML, inside a tiny in-memory
 * router. Any other path resolves to a catch-all route, so links to pages that are not
 * part of the test still produce real hrefs. No DOM library needed.
 */
export async function renderWithRouter(ui: ReactNode) {
	const root = createRootRoute({ component: Outlet });
	const index = createRoute({
		getParentRoute: () => root,
		path: "/",
		component: () => <>{ui}</>,
	});
	const rest = createRoute({
		getParentRoute: () => root,
		path: "$",
		component: () => null,
	});
	const router = createRouter({
		routeTree: root.addChildren([index, rest]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	await router.load();
	// biome-ignore lint/suspicious/noExplicitAny: the test router is not the app's registered router
	const html = renderToString(<RouterProvider router={router as any} />);
	// React separates adjacent text nodes with `<!-- -->`; remove them so assertions read naturally.
	// Intl puts non-breaking spaces inside formatted money ("NPR\u00a04,000.00"); compare with plain ones.
	return html.replace(/<!--.*?-->/g, "").replaceAll("\u00a0", " ");
}
