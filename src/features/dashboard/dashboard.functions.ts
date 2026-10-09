import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { authMiddleware } from "#/lib/auth-middleware";

// The service imports the database client, so load it inside handlers to keep it server-only.
const service = () => import("./dashboard.service.server");

// Garbage in the URL falls back to the current month instead of failing the page.
export const dashboardSearchSchema = z.object({
	month: z.string().optional().catch(undefined),
});

export const getDashboardFn = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(dashboardSearchSchema)
	.handler(async ({ context, data }) => {
		const { getUserToday } = await import(
			"#/features/notifications/notifications.service.server"
		);
		const today = await getUserToday(context.user.id);
		return (await service()).getDashboard(context.user.id, {
			today,
			month: data.month,
		});
	});
