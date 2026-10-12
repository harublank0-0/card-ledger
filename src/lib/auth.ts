import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { prisma } from "#/db";
import { env } from "#/env";
import { isSignupAllowed } from "#/lib/signup-policy";

export const auth = betterAuth({
	baseURL: env.BETTER_AUTH_URL,
	secret: env.BETTER_AUTH_SECRET,
	database: prismaAdapter(prisma, { provider: "postgresql" }),
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 12,
	},
	user: {
		// Self-service account deletion (Settings). Every row the user owns cascades from the
		// user record. A password is required: see `guardAccountDeletion` in the auth route.
		deleteUser: { enabled: true },
	},
	hooks: {
		// Sign-up policy, enforced before Better Auth looks the address up. Left to the
		// user-create hook below, a closed instance would answer "already exists" for a registered
		// address and "disabled" for any other, which tells a stranger who has an account here.
		before: createAuthMiddleware(async (ctx) => {
			if (ctx.path !== "/sign-up/email") return;
			const users = await prisma.user.count();
			if (!isSignupAllowed(env.SIGNUP_MODE, users)) {
				throw new APIError("FORBIDDEN", {
					message: "Sign-up is disabled on this instance.",
				});
			}
		}),
	},
	databaseHooks: {
		user: {
			create: {
				// SIGNUP_MODE policy. In first-user mode the auth route serialises sign-up requests
				// (`serializeFirstUserSignUp`), so the count read here cannot be stale.
				before: async () => {
					const users = await prisma.user.count();
					if (!isSignupAllowed(env.SIGNUP_MODE, users)) {
						throw new APIError("FORBIDDEN", {
							message: "Sign-up is disabled on this instance.",
						});
					}
				},
			},
		},
	},
	plugins: [tanstackStartCookies()],
});
