import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { readSession } from "#/lib/session.server";

/**
 * Authorization boundary for server functions. Route guards are UX only; every server
 * function that touches private data must use this middleware (or check the session itself).
 * Provides `context.user` for user-scoped queries.
 */
export const authMiddleware = createMiddleware({ type: "function" }).server(
	async ({ next }) => {
		const session = await readSession(getRequest().headers);
		if (!session) throw new Error("Unauthorized");
		return next({ context: { user: session.user } });
	},
);
