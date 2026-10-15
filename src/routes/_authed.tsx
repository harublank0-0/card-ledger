import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "#/components/app-shell";
import { getSessionFn } from "#/lib/session.functions";

// Route guards are UX only. Every server function also enforces auth via authMiddleware.
export const Route = createFileRoute("/_authed")({
	beforeLoad: async ({ location }) => {
		const user = await getSessionFn();
		if (!user) {
			throw redirect({ to: "/sign-in", search: { redirect: location.href } });
		}
		return { user };
	},
	component: AuthedLayout,
});

function AuthedLayout() {
	const { user } = Route.useRouteContext();

	return (
		<AppShell email={user.email}>
			<Outlet />
		</AppShell>
	);
}
