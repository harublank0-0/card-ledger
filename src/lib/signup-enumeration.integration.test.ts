import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { prisma } from "#/db";
import { auth } from "#/lib/auth";
import { createUserWithPassword, deleteTestUsers } from "#/test/helpers";

// With sign-up closed to newcomers (SIGNUP_MODE=first-user and an owner already exists, which
// is the default here), the response to a sign-up attempt must not depend on whether the email
// address is registered. Better Auth looks the address up before the user-create hook runs, so
// the policy has to be enforced earlier.
const created: string[] = [];
afterAll(async () => {
	await deleteTestUsers(created);
});

async function signUp(email: string) {
	const response = await auth.handler(
		new Request("http://localhost:3100/api/auth/sign-up/email", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: "http://localhost:3100",
			},
			body: JSON.stringify({
				name: "Probe",
				email,
				password: "a-long-enough-password-123",
			}),
		}),
	);
	return {
		status: response.status,
		body: (await response.json().catch(() => null)) as {
			message?: string;
			code?: string;
		} | null,
	};
}

describe("sign-up when registration is closed", () => {
	it("answers identically for a registered and an unregistered address", async () => {
		const { user } = await createUserWithPassword();
		created.push(user.id);

		const registered = await signUp(user.email);
		const unregistered = await signUp(`nobody-${Date.now()}@card-ledger.test`);

		expect(registered.status).toBe(403);
		expect(unregistered.status).toBe(403);
		expect(registered.body?.message).toBe(unregistered.body?.message);
		expect(registered.body?.code).toBe(unregistered.body?.code);
		expect(JSON.stringify(registered.body)).not.toMatch(/already exist/i);
	});
});

// The policy must also not over-block: open instances still register newcomers, and a closed
// instance refuses everyone, whether or not the address exists. `env` is read when the module
// is first imported, so each mode loads the auth module fresh.
describe("sign-up per SIGNUP_MODE (fresh module per mode)", () => {
	const original = process.env.SIGNUP_MODE;
	const emails: string[] = [];
	afterEach(async () => {
		if (original === undefined) delete process.env.SIGNUP_MODE;
		else process.env.SIGNUP_MODE = original;
		vi.resetModules();
		if (emails.length > 0) {
			await prisma.user.deleteMany({ where: { email: { in: emails } } });
			emails.length = 0;
		}
	});

	async function signUpWith(mode: string, email: string) {
		vi.resetModules();
		process.env.SIGNUP_MODE = mode;
		const { auth: fresh } = await import("#/lib/auth");
		emails.push(email);
		const response = await fresh.handler(
			new Request("http://localhost:3100/api/auth/sign-up/email", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: "http://localhost:3100",
				},
				body: JSON.stringify({
					name: "Mode probe",
					email,
					password: "a-long-enough-password-123",
				}),
			}),
		);
		return response.status;
	}

	it("registers a newcomer when sign-up is open", async () => {
		const email = `open-${Date.now()}@card-ledger.test`;
		expect(await signUpWith("open", email)).toBe(200);
		expect(await prisma.user.findUnique({ where: { email } })).not.toBeNull();
	});

	it("refuses everyone when sign-up is closed", async () => {
		const email = `closed-${Date.now()}@card-ledger.test`;
		expect(await signUpWith("closed", email)).toBe(403);
		expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
	});
});
