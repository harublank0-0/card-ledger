import type { HealthResult } from "./health.logic";

/** A health response must never be cached by a proxy or browser. */
const HEADERS = {
	"Cache-Control": "no-store",
	"X-Content-Type-Options": "nosniff",
} as const;

/**
 * Answer a liveness/readiness probe. Deliberately unauthenticated (Docker, load balancers and
 * proxies must call it) and deliberately thin: it reveals only whether each check passed,
 * never versions, migration names, hostnames or error text.
 */
export async function handleHealthRequest(
	request: Request,
	deps: {
		check: () => Promise<HealthResult>;
		/** Receives the thrown value so the caller can log its class; never put it in the body. */
		onError: (error: unknown) => void;
	},
): Promise<Response> {
	const head = request.method === "HEAD";
	const respond = (status: number, body: unknown) =>
		new Response(head ? null : JSON.stringify(body), {
			status,
			headers: {
				...HEADERS,
				"Content-Type": "application/json; charset=utf-8",
			},
		});

	let result: HealthResult;
	try {
		result = await deps.check();
	} catch (error) {
		deps.onError(error);
		return respond(503, { status: "unavailable" });
	}

	if (result.ok) return respond(200, { status: "ok" });
	return respond(503, { status: "unavailable", checks: result.checks });
}
