import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "#/db";
import { auth } from "#/lib/auth";
import { handleAuthPost } from "#/lib/auth-guards";
import {
	FIRST_USER_SIGNUP_LOCK,
	serializeFirstUserSignUp,
} from "#/lib/signup-lock.server";
import { createUserWithPassword, deleteTestUsers } from "#/test/helpers";

// SIGNUP_MODE=first-user (the default here) lets exactly one account register. Reading the user
// count and inserting the user are separate statements, so simultaneous first sign-ups used to
// be able to both pass. These tests need a user table they own, so they only ever run against
// the dedicated `<db>_test` database.
const emails: string[] = [];
const stray: string[] = [];

beforeAll(async () => {
	const database = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
	if (!database.endsWith("_test")) {
		throw new Error(`Refusing to empty the user table of "${database}"`);
	}
	await prisma.user.deleteMany({});
});

afterAll(async () => {
	await prisma.user.deleteMany({ where: { email: { in: emails } } });
	await deleteTestUsers(stray);
});

function signUpRequest(email: string) {
	emails.push(email);
	return new Request("http://localhost:3100/api/auth/sign-up/email", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			origin: "http://localhost:3100",
		},
		body: JSON.stringify({
			name: "Racer",
			email,
			password: "a-long-enough-password-123",
		}),
	});
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("first-user sign-up race", () => {
	// More requests than the database pool has connections (pg's default is 10), so a request
	// that waits for the lock while holding a connection would starve the one that owns it.
	const BURST = 15;

	it("lets exactly one of a burst of simultaneous first sign-ups through", async () => {
		expect(await prisma.user.count()).toBe(0);

		const stamp = Date.now();
		const responses = await Promise.all(
			Array.from({ length: BURST }, (_, i) =>
				handleAuthPost(
					signUpRequest(`racer-${stamp}-${i}@card-ledger.test`),
					auth.handler,
					{ serializeSignUp: serializeFirstUserSignUp },
				),
			),
		);

		const statuses = responses.map((response) => response.status).sort();
		expect(statuses).toEqual([200, ...Array(BURST - 1).fill(403)]);
		expect(await prisma.user.count()).toBe(1);
	});

	it("refuses a later sign-up once the owner exists", async () => {
		const response = await handleAuthPost(
			signUpRequest(`late-${Date.now()}@card-ledger.test`),
			auth.handler,
			{ serializeSignUp: serializeFirstUserSignUp },
		);
		expect(response.status).toBe(403);
		expect(await prisma.user.count()).toBe(1);
	});
});

// The lock itself, without depending on request timing: hold it from a second connection and
// see whether a first-user request waits for it.
describe("serializeFirstUserSignUp lock", () => {
	async function withHeldLock(body: () => Promise<void>) {
		const holder = new pg.Client({
			connectionString: process.env.DATABASE_URL,
		});
		await holder.connect();
		await holder.query("select pg_advisory_lock(hashtext($1::text))", [
			FIRST_USER_SIGNUP_LOCK,
		]);
		try {
			await body();
		} finally {
			// Closing the connection releases a session-level advisory lock.
			await holder.end();
		}
		return holder;
	}

	it("makes a first-user request wait while another request holds the lock", async () => {
		await prisma.user.deleteMany({});
		let ran = false;

		let pending: Promise<string> | undefined;
		await withHeldLock(async () => {
			pending = serializeFirstUserSignUp(async () => {
				ran = true;
				return "done";
			});
			await sleep(400);
			expect(ran).toBe(false);
		});

		await expect(pending).resolves.toBe("done");
		expect(ran).toBe(true);
	});

	it("does not wait once a user exists, so an established instance never queues", async () => {
		const { user } = await createUserWithPassword();
		stray.push(user.id);

		let ran = false;
		await withHeldLock(async () => {
			const outcome = await Promise.race([
				serializeFirstUserSignUp(async () => {
					ran = true;
					return "done";
				}),
				sleep(3_000).then(() => "timed out"),
			]);
			expect(outcome).toBe("done");
		});
		expect(ran).toBe(true);
	});

	it("releases the lock when the wrapped request fails", async () => {
		await prisma.user.deleteMany({});
		await expect(
			serializeFirstUserSignUp(async () => {
				throw new Error("handler failed");
			}),
		).rejects.toThrow("handler failed");

		// A following request must not be stuck behind the failed one.
		await expect(
			Promise.race([
				serializeFirstUserSignUp(async () => "next"),
				sleep(3_000).then(() => "stuck"),
			]),
		).resolves.toBe("next");
	});
});
