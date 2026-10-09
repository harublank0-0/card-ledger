import type { getDashboard } from "./dashboard.service.server";

/** What the dashboard server function returns (plain data; dates are YYYY-MM-DD strings). */
export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
