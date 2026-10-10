import { ZodError } from "zod";

export const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/**
 * What a server function is allowed to tell the browser about a failure.
 *
 * Server functions return `error.message` to the client. Only messages this application wrote
 * may reach it: a database or runtime error can carry an internal host and port, a constraint
 * or column name, or part of a query. The services throw plain `Error`s with messages written
 * for people ("Subscription not found"), validation failures become their first readable
 * message, and everything else (Prisma, pg, TypeError, RangeError, ...) becomes a generic one.
 * Values that are not errors, such as redirects and not-found, pass through untouched.
 */
export function toClientError(error: unknown): unknown {
	if (!(error instanceof Error)) return error;

	// Deliberate, user-facing messages.
	if (error.constructor === Error) return error;
	if (error.name === "APIError") return error; // Better Auth: written for users

	if (error instanceof ZodError) {
		return new Error(
			error.issues[0]?.message || "Check the form and try again.",
		);
	}
	return new Error(GENERIC_ERROR_MESSAGE);
}
