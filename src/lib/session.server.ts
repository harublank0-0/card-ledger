import { auth } from "#/lib/auth";
import { errorClass, logger } from "#/lib/logger.server";

export const SERVICE_UNAVAILABLE_MESSAGE =
	"The service is temporarily unavailable. Please try again in a moment.";

/**
 * The signed-in session for a request, or null when there is none.
 *
 * A *failed* lookup (the database is unreachable, for example) is not "signed out": it is
 * logged by class only and surfaces as a plain message about the service. Left alone, Better
 * Auth's own "Failed to get session" would reach the browser, because its errors are allowed
 * through as written for people.
 */
export async function readSession(headers: Headers) {
	try {
		return await auth.api.getSession({ headers });
	} catch (error) {
		logger.error("session lookup failed", { errorClass: errorClass(error) });
		throw new Error(SERVICE_UNAVAILABLE_MESSAGE);
	}
}
