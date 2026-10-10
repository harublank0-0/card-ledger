import { describe, expect, it } from "vitest";

import { guardAccountDeletion } from "./auth-guards";

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
