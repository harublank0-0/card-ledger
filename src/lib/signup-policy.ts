import type { SignupMode } from "#/env.schema";

/**
 * Decides whether a new account may be created.
 * - first-user: only while no account exists (self-hosting default)
 * - open: always
 * - closed: never
 */
export function isSignupAllowed(mode: SignupMode, existingUsers: number) {
	switch (mode) {
		case "open":
			return true;
		case "closed":
			return false;
		case "first-user":
			return existingUsers === 0;
	}
}
