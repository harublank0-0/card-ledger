import { describe, expect, it } from "vitest";
import { z } from "zod";

import { GENERIC_ERROR_MESSAGE, toClientError } from "./client-errors";

// Server functions return `error.message` to the browser. Only messages the application
// itself wrote may reach it: a database error can carry a host and port, a constraint name,
// part of a query or a column value.
describe("toClientError", () => {
	it("keeps the messages the services deliberately throw", () => {
		const error = new Error("Subscription not found");
		expect(toClientError(error)).toBe(error);
		const unauthorized = new Error("Unauthorized");
		expect(toClientError(unauthorized)).toBe(unauthorized);
	});

	it("replaces database and runtime errors with a generic message", () => {
		class PrismaClientInitializationError extends Error {}
		class DatabaseError extends Error {}
		const leaky = [
			new PrismaClientInitializationError(
				"Can't reach database server at `10.0.3.7:5432`",
			),
			new DatabaseError(
				'duplicate key value violates unique constraint "category_userId_name_key"',
			),
			new TypeError("Cannot read properties of undefined (reading 'id')"),
			new RangeError("Invalid time zone specified: Kathmandu"),
			new SyntaxError("Unexpected token < in JSON at position 0"),
		];
		for (const error of leaky) {
			const result = toClientError(error) as Error;
			expect(result, error.constructor.name).toBeInstanceOf(Error);
			expect(result.message).toBe(GENERIC_ERROR_MESSAGE);
			expect(result).not.toBe(error);
		}
	});

	it("turns a validation error into its first readable message, not raw JSON", () => {
		const parsed = z
			.object({ name: z.string().min(1, "Enter a name") })
			.safeParse({ name: "" });
		expect(parsed.success).toBe(false);
		const result = toClientError(parsed.error) as Error;
		expect(result.message).toBe("Enter a name");
		expect(result.message).not.toContain("{");
	});

	it("passes through values that are not errors, such as redirects and not-found", () => {
		const redirectLike = { isRedirect: true, to: "/sign-in" };
		expect(toClientError(redirectLike)).toBe(redirectLike);
		const response = new Response(null, { status: 302 });
		expect(toClientError(response)).toBe(response);
	});

	it("keeps Better Auth's API errors, which are written for users", () => {
		class APIError extends Error {
			constructor(message: string) {
				super(message);
				this.name = "APIError";
			}
		}
		const error = new APIError("Sign-up is disabled on this instance.");
		expect(toClientError(error)).toBe(error);
	});
});
