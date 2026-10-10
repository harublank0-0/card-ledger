const DELETE_USER_PATH = "/api/auth/delete-user";

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

/**
 * What the `/api/auth/*` POST route does: apply the guards, then hand the request to Better
 * Auth. Kept as one function so the route and its tests use the exact same composition.
 */
export async function handleAuthPost(
	request: Request,
	handler: (request: Request) => Response | Promise<Response>,
): Promise<Response> {
	return (await guardAccountDeletion(request)) ?? handler(request);
}
