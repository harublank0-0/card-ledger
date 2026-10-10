import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

/**
 * Router and query inspectors for local development. Loaded only when `import.meta.env.DEV`
 * (see `src/routes/__root.tsx`), so none of it reaches a production build. It deliberately
 * does not use the TanStack devtools Vite plugin: that plugin opens an unauthenticated
 * localhost HTTP endpoint that can run shell commands.
 */
export default function DevPanels() {
	return (
		<>
			<TanStackRouterDevtools position="bottom-right" />
			<ReactQueryDevtools buttonPosition="bottom-left" />
		</>
	);
}
