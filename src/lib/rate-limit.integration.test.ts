import { describe, expect, it, vi } from "vitest";

// Better Auth turns its rate limiter on only in production, and reads NODE_ENV once, when its
// own module is first imported. Setting it before any import (hoisted) makes this file measure
// the production behaviour regardless of what ran earlier in the process.
vi.hoisted(() => {
	process.env.NODE_ENV = "production";
});

import { auth } from "#/lib/auth";

// The client address is the single-valued X-Forwarded-For the reverse proxy sets
// (docs/self-hosting.md, "Reaching it from other devices").
async function signIn(forwardedFor: string) {
	const response = await auth.handler(
		new Request("http://localhost:3100/api/auth/sign-in/email", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: "http://localhost:3100",
				"x-forwarded-for": forwardedFor,
			},
			body: JSON.stringify({
				email: "nobody@card-ledger.test",
				password: "wrong-password-123",
			}),
		}),
	);
	return response.status;
}

async function attempts(forwardedFor: string, count = 8) {
	const statuses: number[] = [];
	for (let i = 0; i < count; i++) statuses.push(await signIn(forwardedFor));
	return statuses;
}

describe("sign-in rate limiting (production mode)", () => {
	it("limits repeated attempts from one client address", async () => {
		expect(await attempts("203.0.113.50")).toContain(429);
	});

	it("keeps separate budgets for separate client addresses", async () => {
		await attempts("203.0.113.60");
		expect(await signIn("203.0.113.61")).not.toBe(429);
	});

	it("does not let a client reset its budget by rotating a claimed address", async () => {
		// A proxy that appends keeps the real address last and the claimed one first. The
		// chain has more than one entry, so it is not trusted as an address at all: every such
		// request shares one bucket, and rotating the claim cannot escape it.
		const statuses: number[] = [];
		for (let i = 0; i < 8; i++) {
			statuses.push(await signIn(`198.51.100.${i + 1}, 203.0.113.70`));
		}
		expect(statuses).toContain(429);
	});
});
