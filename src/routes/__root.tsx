import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
} from "@tanstack/react-router";
import { type ComponentType, useEffect, useState } from "react";
import appCss from "../styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "Card Ledger",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<DevTools />
				<Scripts />
			</body>
		</html>
	);
}

/** Router and query inspectors, in development only and only in the browser. */
function DevTools() {
	const [Panels, setPanels] = useState<ComponentType | null>(null);
	useEffect(() => {
		if (!import.meta.env.DEV) return;
		import("../integrations/devtools").then((module) =>
			setPanels(() => module.default),
		);
	}, []);
	return Panels ? <Panels /> : null;
}
