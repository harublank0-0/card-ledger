const DELETE_USER_PATH = "/api/auth/delete-user";
const SIGN_UP_PATH = "/api/auth/sign-up/email";

function normalisedPath(request: Request) {
	let path = new URL(request.url).pathname;
	try {
		path = decodeURIComponent(path);
	} catch {
		// Leave undecodable paths as they are; they will not match.
	}
	return path.toLowerCase().replace(/\/+$/, "");
}

/**
 * Better Auth deletes an account without asking for a password when the session is recent
 * ("fresh"). A stolen session cookie must not be enough to erase someone's data, so the route
 * refuses any deletion request that does not carry the password. Returns a response to send
 * instead of calling Better Auth, or null to let the request through.
 */
export async function guardAccountDeletion(
	request: Request,
): Promise<Response | null> {
	if (request.method !== "POST") return null;
	if (normalisedPath(request) !== DELETE_USER_PATH) return null;

	// Better Auth chooses how to read the body from the Content-Type, and only parses JSON for
	// application/json-shaped types. A type that merely contains "application/json" (for
	// example "x/application/json") makes it pass the raw stream through, so the password this
	// guard sees below would never be checked. Accept only the one type the app itself sends.
	const mediaType = (request.headers.get("content-type") ?? "")
		.split(";")[0]
		.trim()
		.toLowerCase();
	if (mediaType !== "application/json") {
		return Response.json(
			{
				code: "UNSUPPORTED_MEDIA_TYPE",
				message: "Send the request as application/json.",
			},
			{ status: 415, headers: { "Cache-Control": "no-store" } },
		);
	}

	let password: unknown;
	try {
		password = ((await request.clone().json()) as { password?: unknown })
			?.password;
	} catch {
		password = undefined;
	}
	if (typeof password === "string" && password.length > 0) return null;

	return Response.json(
		{
			code: "PASSWORD_REQUIRED",
			message: "Enter your password to delete your account.",
		},
		{ status: 400, headers: { "Cache-Control": "no-store" } },
	);
}

/** Whether this is the email sign-up endpoint (same normalisation as the deletion guard). */
export function isSignUpRequest(request: Request) {
	return request.method === "POST" && normalisedPath(request) === SIGN_UP_PATH;
}

/** Runs a task so that concurrent calls cannot interleave. */
export type SignUpSerializer = <T>(run: () => Promise<T>) => Promise<T>;

/**
 * What the `/api/auth/*` POST route does: apply the guards, then hand the request to Better
 * Auth. Kept as one function so the route and its tests use the exact same composition.
 *
 * `serializeSignUp`, when given, wraps sign-up requests (and only those), so that a policy
 * which depends on counting existing users cannot be raced by simultaneous requests.
 */
export async function handleAuthPost(
	request: Request,
	handler: (request: Request) => Response | Promise<Response>,
	options: { serializeSignUp?: SignUpSerializer } = {},
): Promise<Response> {
	const blocked = await guardAccountDeletion(request);
	if (blocked) return blocked;
	if (options.serializeSignUp && isSignUpRequest(request)) {
		return options.serializeSignUp(async () => handler(request));
	}
	return handler(request);
}
