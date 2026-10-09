import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
	useRouter,
} from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import { authClient } from "#/lib/auth-client";
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

const navClass =
	"rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground";

function AuthedLayout() {
	const router = useRouter();
	const { user } = Route.useRouteContext();

	return (
		<div className="mx-auto max-w-5xl p-4 sm:p-6">
			<header className="mb-6 flex flex-wrap items-center justify-between gap-3">
				<div className="flex items-center gap-4">
					<Link to="/subscriptions" className="text-lg font-semibold">
						Card Ledger
					</Link>
					<nav className="flex gap-1" aria-label="Main">
						<Link
							to="/subscriptions"
							className={navClass}
							activeProps={{ className: "bg-secondary text-foreground" }}
							activeOptions={{ exact: false }}
						>
							Subscriptions
						</Link>
						<Link
							to="/cards"
							className={navClass}
							activeProps={{ className: "bg-secondary text-foreground" }}
							activeOptions={{ exact: false }}
						>
							Cards
						</Link>
						<Link
							to="/settings"
							className={navClass}
							activeProps={{ className: "bg-secondary text-foreground" }}
							activeOptions={{ exact: false }}
						>
							Settings
						</Link>
					</nav>
				</div>
				<div className="flex items-center gap-3 text-sm text-muted-foreground">
					<span className="hidden sm:inline">{user.email}</span>
					<Button
						variant="outline"
						size="sm"
						onClick={async () => {
							await authClient.signOut();
							await router.invalidate();
							await router.navigate({ to: "/sign-in" });
						}}
					>
						Sign out
					</Button>
				</div>
			</header>
			<Outlet />
		</div>
	);
}
