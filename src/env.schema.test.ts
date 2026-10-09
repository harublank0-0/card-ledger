import { describe, expect, it } from "vitest";
import { z } from "zod";

import { serverEnvSchema } from "./env.schema";

const schema = z.object(serverEnvSchema);
const valid = {
	DATABASE_URL: "postgresql://u:p@localhost:5432/db",
	BETTER_AUTH_URL: "http://localhost:3000",
	BETTER_AUTH_SECRET: "x".repeat(32),
};

describe("serverEnvSchema", () => {
	it("applies safe defaults", () => {
		const env = schema.parse(valid);
		expect(env.SIGNUP_MODE).toBe("first-user");
		expect(env.MCP_ENABLED).toBe(false);
		expect(env.DEFAULT_TIMEZONE).toBe("Asia/Kathmandu");
		expect(env.SMTP_HOST).toBeUndefined();
	});

	it("rejects an unknown SIGNUP_MODE", () => {
		expect(() => schema.parse({ ...valid, SIGNUP_MODE: "everyone" })).toThrow();
	});

	it("rejects a short auth secret", () => {
		expect(() =>
			schema.parse({ ...valid, BETTER_AUTH_SECRET: "short" }),
		).toThrow();
	});

	it("parses boolean-ish and numeric strings", () => {
		const env = schema.parse({
			...valid,
			MCP_ENABLED: "true",
			SMTP_PORT: "587",
			SMTP_SECURE: "false",
		});
		expect(env.MCP_ENABLED).toBe(true);
		expect(env.SMTP_PORT).toBe(587);
		expect(env.SMTP_SECURE).toBe(false);
	});
});
