import { createServerFn } from "@tanstack/react-start";

import { authMiddleware } from "#/lib/auth-middleware";

// The service imports the database client, so load it inside handlers to keep it server-only.
export const getAccountSummaryFn = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) =>
		(await import("./account.service.server")).getAccountSummary(
			context.user.id,
		),
	);
