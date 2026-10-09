import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

import { env } from "#/env";
import { isSignupAllowed } from "#/lib/signup-policy";

/** Current user, or null. Used by route guards for redirects (UX only, not the data boundary). */
export const getSessionFn = createServerFn({ method: "GET" }).handler(
	async () => {
		const { auth } = await import("#/lib/auth");
		const session = await auth.api.getSession({
			headers: getRequest().headers,
		});
		return session
			? {
					id: session.user.id,
					name: session.user.name,
					email: session.user.email,
				}
			: null;
	},
);

/** Whether the sign-up page should offer registration (public, reveals no user data). */
export const getSignupAllowedFn = createServerFn({ method: "GET" }).handler(
	async () => {
		const { prisma } = await import("#/db");
		return isSignupAllowed(env.SIGNUP_MODE, await prisma.user.count());
	},
);
