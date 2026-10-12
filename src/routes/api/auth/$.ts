import { createFileRoute } from "@tanstack/react-router";
import { env } from "#/env";
import { auth } from "#/lib/auth";
import { handleAuthPost } from "#/lib/auth-guards";
import { serializeFirstUserSignUp } from "#/lib/signup-lock.server";

export const Route = createFileRoute("/api/auth/$")({
	server: {
		handlers: {
			GET: ({ request }) => auth.handler(request),
			POST: ({ request }) =>
				handleAuthPost(request, auth.handler, {
					// Only "first-user" mode counts existing users; the other modes never need it.
					serializeSignUp:
						env.SIGNUP_MODE === "first-user"
							? serializeFirstUserSignUp
							: undefined,
				}),
		},
	},
});
