import { createFileRoute } from "@tanstack/react-router";

import { DashboardView } from "#/features/dashboard/components/dashboard-view";
import {
	dashboardSearchSchema,
	getDashboardFn,
} from "#/features/dashboard/dashboard.functions";

export const Route = createFileRoute("/_authed/")({
	validateSearch: dashboardSearchSchema,
	loaderDeps: ({ search }) => search,
	loader: ({ deps }) => getDashboardFn({ data: deps }),
	component: Dashboard,
});

function Dashboard() {
	return <DashboardView data={Route.useLoaderData()} />;
}
