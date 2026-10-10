import { describe, expect, it } from "vitest";
import { z } from "zod";

import { describeEnvProblems, serverEnvSchema } from "./env.schema";

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

describe("describeEnvProblems", () => {
	it("returns nothing for a valid environment", () => {
		expect(describeEnvProblems(valid)).toEqual([]);
	});

	it("names every invalid variable, sorted, with a rule", () => {
		const problems = describeEnvProblems({
			BETTER_AUTH_URL: "http://localhost:3000",
			BETTER_AUTH_SECRET: "short",
			SIGNUP_MODE: "everyone",
		});
		expect(problems.map((problem) => problem.name)).toEqual([
			"BETTER_AUTH_SECRET",
			"DATABASE_URL",
			"SIGNUP_MODE",
		]);
		for (const problem of problems)
			expect(problem.problem.length).toBeGreaterThan(0);
	});

	it("treats an empty string as unset, like the runtime environment does", () => {
		const problems = describeEnvProblems({
			...valid,
			SIGNUP_MODE: "",
			DATABASE_URL: "",
		});
		expect(problems.map((problem) => problem.name)).toEqual(["DATABASE_URL"]);
	});

	it("never repeats a value it was given", () => {
		const secretish = "hunter2-not-long-enough";
		const modeish = "s3cr3t-mode";
		const problems = describeEnvProblems({
			...valid,
			BETTER_AUTH_SECRET: secretish,
			SIGNUP_MODE: modeish,
			BETTER_AUTH_URL: "not a url with password=p4ssw0rd",
		});
		const text = JSON.stringify(problems);
		expect(problems.length).toBe(3);
		expect(text).not.toContain(secretish);
		expect(text).not.toContain(modeish);
		expect(text).not.toContain("p4ssw0rd");
	});
});
