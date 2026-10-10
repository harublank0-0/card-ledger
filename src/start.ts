import {
	createCsrfMiddleware,
	createMiddleware,
	createStart,
} from "@tanstack/react-start";

import { GENERIC_ERROR_MESSAGE, toClientError } from "#/lib/client-errors";

// Having a start instance replaces TanStack Start's built-in request middleware, so its
// default CSRF protection for server functions must be added back explicitly (the framework
// warns about exactly this). Verified against a built server: a cross-site POST is refused.
const csrfMiddleware = createCsrfMiddleware({
	filter: (ctx) => ctx.handlerType === "serverFn",
});

/**
 * Applied to every server function. Errors are returned to the browser as `error.message`,
 * so only messages this application wrote may leave: see `toClientError`. Unexpected failures
 * are logged here by class only (never the message, which may hold a connection string).
 */
const sanitizeErrors = createMiddleware({ type: "function" }).server(
	async ({ next }) => {
		try {
			return await next();
		} catch (error) {
			const safe = toClientError(error);
			if (
				safe !== error &&
				safe instanceof Error &&
				safe.message === GENERIC_ERROR_MESSAGE
			) {
				const { errorClass, logger } = await import("#/lib/logger.server");
				logger.error("server function failed", { error: errorClass(error) });
			}
			throw safe;
		}
	},
);

export const startInstance = createStart(() => ({
	requestMiddleware: [csrfMiddleware],
	functionMiddleware: [sanitizeErrors],
}));
