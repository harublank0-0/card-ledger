import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "#/db";
import { auth } from "#/lib/auth";
import { handleAuthPost } from "#/lib/auth-guards";
import {
	createUserWithPassword,
	deleteTestUsers,
	signInHeaders,
} from "#/test/helpers";

// The route composition (guard, then the real Better Auth handler) against a real user. This
// is the regression test for a bypass where a crafted Content-Type made Better Auth skip the
// password check that the guard believed it had enforced.
const created: string[] = [];
afterAll(async () => {
	await deleteTestUsers(created);
});

async function deleteAttempt(
	contentType: string | null,
	body: unknown,
	options: { useRealPassword?: boolean } = {},
) {
	const { user, password } = await createUserWithPassword();
	created.push(user.id);
	const session = await signInHeaders(user.email, password);
	const payload =
		options.useRealPassword && typeof body === "object" && body !== null
			? { ...body, password }
			: body;
	const headers: Record<string, string> = {
		cookie: session.get("cookie") ?? "",
		origin: "http://localhost:3100",
	};
	if (contentType) headers["content-type"] = contentType;
	const response = await handleAuthPost(
		new Request("http://localhost:3100/api/auth/delete-user", {
			method: "POST",
			headers,
			body: JSON.stringify(payload),
		}),
		auth.handler,
	);
	const row = await prisma.user.findUnique({ where: { id: user.id } });
	return { status: response.status, deleted: row === null };
}

describe("DELETE /api/auth/delete-user through the real route composition", () => {
	it("never deletes with a wrong password, whatever the Content-Type", async () => {
		for (const contentType of [
			"application/json",
			"x/application/json",
			"text/x-application/json",
			"text/plain",
			"application/x-www-form-urlencoded",
			null,
		]) {
			const result = await deleteAttempt(contentType, {
				password: "definitely-wrong-password",
			});
			expect(result.deleted, String(contentType)).toBe(false);
		}
	});

	it("never deletes without a password, whatever the Content-Type", async () => {
		for (const contentType of [
			"application/json",
			"x/application/json",
			null,
		]) {
			const result = await deleteAttempt(contentType, {});
			expect(result.deleted, String(contentType)).toBe(false);
		}
	});

	it("still deletes the account with the correct password over application/json", async () => {
		const result = await deleteAttempt(
			"application/json",
			{},
			{ useRealPassword: true },
		);
		expect(result).toEqual({ status: 200, deleted: true });
	});
});
