import { describe, expect, it } from "vitest";

import {
	guardAccountDeletion,
	handleAuthPost,
	isSignUpRequest,
} from "./auth-guards";

const post = (path: string, body?: unknown, raw?: string) =>
	new Request(`http://localhost:3100${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
	});

describe("guardAccountDeletion", () => {
	it("blocks deletion without a password", async () => {
		for (const request of [
			post("/api/auth/delete-user"),
			post("/api/auth/delete-user", {}),
			post("/api/auth/delete-user", { password: "" }),
			post("/api/auth/delete-user", { password: 12345 }),
			post("/api/auth/delete-user", { token: "abc" }),
			post("/api/auth/delete-user", undefined, "not json"),
		]) {
			const response = await guardAccountDeletion(request);
			expect(response?.status).toBe(400);
			expect(await response?.json()).toMatchObject({
				code: "PASSWORD_REQUIRED",
			});
		}
	});

	it("only accepts a body Better Auth will parse the same way: exactly application/json", async () => {
		// Better Auth picks its parser from the Content-Type. A type that merely *contains*
		// "application/json" is not parsed as JSON by it, so a password the guard saw would
		// never reach the password check. Refuse anything but application/json.
		for (const contentType of [
			"x/application/json",
			"text/x-application/json",
			"text/plain",
			"application/x-www-form-urlencoded",
			"multipart/form-data; boundary=x",
			"application/vnd.api+json",
			"",
		]) {
			const request = new Request(
				"http://localhost:3100/api/auth/delete-user",
				{
					method: "POST",
					headers: contentType ? { "content-type": contentType } : {},
					body: JSON.stringify({ password: "correct-horse" }),
				},
			);
			const response = await guardAccountDeletion(request);
			expect(response?.status, contentType || "(none)").toBe(415);
			expect(await response?.json()).toMatchObject({
				code: "UNSUPPORTED_MEDIA_TYPE",
			});
		}
	});

	it("accepts application/json however it is cased or parameterised", async () => {
		for (const contentType of [
			"application/json",
			"application/json; charset=utf-8",
			"Application/JSON",
		]) {
			const request = new Request(
				"http://localhost:3100/api/auth/delete-user",
				{
					method: "POST",
					headers: { "content-type": contentType },
					body: JSON.stringify({ password: "correct-horse" }),
				},
			);
			expect(await guardAccountDeletion(request), contentType).toBeNull();
		}
	});

	it("blocks path variants that Better Auth might still route", async () => {
		for (const path of [
			"/api/auth/delete-user/",
			"/api/auth/Delete-User",
			"/api/auth/delete%2Duser",
			"/api/auth/delete-user//",
		]) {
			expect((await guardAccountDeletion(post(path, {})))?.status).toBe(400);
		}
	});

	it("lets a request with a password through, and does not consume its body", async () => {
		const request = post("/api/auth/delete-user", {
			password: "correct-horse",
		});
		expect(await guardAccountDeletion(request)).toBeNull();
		expect(await request.json()).toEqual({ password: "correct-horse" });
	});

	it("ignores every other request", async () => {
		expect(
			await guardAccountDeletion(post("/api/auth/sign-in/email", {})),
		).toBeNull();
		expect(await guardAccountDeletion(post("/api/auth/sign-out"))).toBeNull();
		expect(
			await guardAccountDeletion(
				new Request("http://localhost:3100/api/auth/delete-user", {
					method: "GET",
				}),
			),
		).toBeNull();
	});
});

describe("isSignUpRequest", () => {
	it("recognises the email sign-up POST, including path variants Better Auth might route", () => {
		for (const path of [
			"/api/auth/sign-up/email",
			"/api/auth/sign-up/email/",
			"/api/auth/Sign-Up/Email",
			"/api/auth/sign-up%2Femail",
		]) {
			expect(isSignUpRequest(post(path, {})), path).toBe(true);
		}
	});

	it("is false for everything else", () => {
		expect(isSignUpRequest(post("/api/auth/sign-in/email", {}))).toBe(false);
		expect(isSignUpRequest(post("/api/auth/sign-up", {}))).toBe(false);
		expect(isSignUpRequest(post("/api/auth/sign-up/email/extra", {}))).toBe(
			false,
		);
		expect(
			isSignUpRequest(
				new Request("http://localhost:3100/api/auth/sign-up/email", {
					method: "GET",
				}),
			),
		).toBe(false);
	});
});

describe("handleAuthPost", () => {
	const ok = async () => new Response("handled");

	it("runs only sign-up requests through the serializer, with the request untouched", async () => {
		const calls: string[] = [];
		const serializeSignUp = async <T>(run: () => Promise<T>) => {
			calls.push("serialized");
			return run();
		};
		const handler = async (request: Request) => {
			calls.push(`handled ${new URL(request.url).pathname}`);
			return new Response(await request.text());
		};

		const signUp = post("/api/auth/sign-up/email", { email: "a@b.test" });
		const response = await handleAuthPost(signUp, handler, { serializeSignUp });
		expect(await response.text()).toBe('{"email":"a@b.test"}');
		expect(calls).toEqual(["serialized", "handled /api/auth/sign-up/email"]);

		calls.length = 0;
		await handleAuthPost(post("/api/auth/sign-in/email", {}), handler, {
			serializeSignUp,
		});
		expect(calls).toEqual(["handled /api/auth/sign-in/email"]);
	});

	it("does not serialise when no serializer is given", async () => {
		const response = await handleAuthPost(
			post("/api/auth/sign-up/email", {}),
			ok,
		);
		expect(await response.text()).toBe("handled");
	});

	it("still applies the account-deletion guard first", async () => {
		let serialized = false;
		const response = await handleAuthPost(
			post("/api/auth/delete-user", {}),
			ok,
			{
				serializeSignUp: async (run) => {
					serialized = true;
					return run();
				},
			},
		);
		expect(response.status).toBe(400);
		expect(serialized).toBe(false);
	});

	it("lets a failure inside the serializer reach the caller", async () => {
		await expect(
			handleAuthPost(post("/api/auth/sign-up/email", {}), ok, {
				serializeSignUp: async () => {
					throw new Error("lock unavailable");
				},
			}),
		).rejects.toThrow("lock unavailable");
	});
});
