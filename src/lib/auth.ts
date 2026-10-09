import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";
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
	databaseHooks: {
		user: {
			create: {
				// SIGNUP_MODE policy. Note: two truly simultaneous first sign-ups could both
				// pass the count check; acceptable for a single-operator install.
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
