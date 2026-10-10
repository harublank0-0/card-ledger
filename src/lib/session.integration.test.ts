import { readFileSync } from "node:fs";
import path from "node:path";
import { APIError } from "better-auth/api";
import { afterEach, describe, expect, it, vi } from "vitest";

import { auth } from "#/lib/auth";
import { toClientError } from "#/lib/client-errors";
import { readSession, SERVICE_UNAVAILABLE_MESSAGE } from "#/lib/session.server";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("readSession", () => {
	it("returns null for a request without a session", async () => {
		await expect(readSession(new Headers())).resolves.toBeNull();
	});

	// With the database down Better Auth throws APIError "Failed to get session". That text
	// passes the client-error allowlist (APIErrors are written for people), so the browser
	// showed it verbatim. The person should be told what is actually going on instead.
	it("turns a failed lookup into a message about the service, not the library's", async () => {
		vi.spyOn(auth.api, "getSession").mockRejectedValue(
			new APIError("INTERNAL_SERVER_ERROR", {
				message: "Failed to get session",
			}),
		);
		const error = await readSession(new Headers()).catch((e) => e);
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toBe(SERVICE_UNAVAILABLE_MESSAGE);
		expect((error as Error).message).not.toContain("Failed to get session");

		// And that message is one the browser is allowed to receive as written.
		const shown = toClientError(error) as Error;
		expect(shown.message).toBe(SERVICE_UNAVAILABLE_MESSAGE);
	});

	it("does not leak the underlying error", async () => {
		vi.spyOn(auth.api, "getSession").mockRejectedValue(
			new Error("connect ECONNREFUSED 10.0.0.5:5432"),
		);
		const error = await readSession(new Headers()).catch((e) => e);
		expect((error as Error).message).toBe(SERVICE_UNAVAILABLE_MESSAGE);
	});
});

// The two places a signed-in person's page or data depends on the session must read it through
// `readSession`; calling Better Auth directly would put its own error text back in the browser.
describe("session reads in the UI paths", () => {
	it.each([
		"src/lib/auth-middleware.ts",
		"src/lib/session.functions.ts",
	])("%s goes through readSession", (file) => {
		const code = readFileSync(path.join(process.cwd(), file), "utf8");
		expect(code).toContain("readSession(");
		expect(code).not.toMatch(/auth\.api\.getSession\(/);
	});
});
