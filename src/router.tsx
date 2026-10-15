import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { RouteError, RouteNotFound } from "./components/route-fallbacks";
import { RoutePending } from "./components/route-pending";
import { getContext } from "./integrations/tanstack-query/root-provider";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
	const context = getContext();

	const router = createTanStackRouter({
		routeTree,
		context,
		scrollRestoration: true,
		defaultPreload: "intent",
		defaultPreloadStaleTime: 0,
		defaultErrorComponent: RouteError,
		defaultNotFoundComponent: RouteNotFound,
		// A slow page shows its outline in place of the content (the shell stays put); fast
		// ones only show the progress bar in the shell.
		defaultPendingComponent: RoutePending,
		defaultPendingMs: 600,
		defaultPendingMinMs: 300,
	});

	setupRouterSsrQueryIntegration({ router, queryClient: context.queryClient });

	return router;
}

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
