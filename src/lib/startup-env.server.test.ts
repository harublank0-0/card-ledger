import { describe, expect, it } from "vitest";

import { checkStartupEnv } from "./startup-env.server";

const valid = {
	DATABASE_URL: "postgresql://cardledger:db-pass-9f3@db:5432/cardledger",
	BETTER_AUTH_URL: "http://localhost:3000",
	BETTER_AUTH_SECRET: "a-long-enough-secret-value-0123456789",
};

type Entry = { msg: string; fields?: Record<string, unknown> };

function harness(production: boolean) {
	const info: Entry[] = [];
	const error: Entry[] = [];
	const exits: number[] = [];
	const deps = {
		production,
		log: {
			info: (msg: string, fields?: Record<string, unknown>) =>
				info.push({ msg, fields }),
			error: (msg: string, fields?: Record<string, unknown>) =>
				error.push({ msg, fields }),
		},
		exit: (code: number) => {
			exits.push(code);
		},
	};
	return { deps, info, error, exits };
}

describe("checkStartupEnv", () => {
	it("accepts a valid environment and reports the effective policy once", () => {
		const { deps, info, error, exits } = harness(true);
		const ok = checkStartupEnv(
			{ ...valid, SIGNUP_MODE: "closed", SMTP_HOST: "smtp.example.test" },
			deps,
		);
		expect(ok).toBe(true);
		expect(exits).toEqual([]);
		expect(error).toEqual([]);
		expect(info).toEqual([
			{
				msg: "configuration valid",
				fields: { signupMode: "closed", smtp: true, mcpEnabled: false },
			},
		]);
	});

	it("names each invalid variable and exits 1 in production", () => {
		const { deps, error, exits } = harness(true);
		const ok = checkStartupEnv(
			{ BETTER_AUTH_URL: valid.BETTER_AUTH_URL, BETTER_AUTH_SECRET: "short" },
			deps,
		);
		expect(ok).toBe(false);
		expect(exits).toEqual([1]);
		const variables = error
			.map((entry) => entry.fields?.variable)
			.filter(Boolean);
		expect(variables).toEqual(["BETTER_AUTH_SECRET", "DATABASE_URL"]);
		expect(error.at(-1)?.msg).toBe("invalid configuration, refusing to start");
	});

	it("reports but does not exit outside production", () => {
		const { deps, error, exits } = harness(false);
		expect(checkStartupEnv({}, deps)).toBe(false);
		expect(error.length).toBeGreaterThan(0);
		expect(exits).toEqual([]);
	});

	it("never logs a value from the environment", () => {
		const { deps, info, error } = harness(true);
		checkStartupEnv(
			{
				...valid,
				BETTER_AUTH_SECRET: "tooshort-but-secret-hunter2",
				SIGNUP_MODE: "everyone-p4ss",
			},
			deps,
		);
		const output = JSON.stringify([...info, ...error]);
		expect(output).not.toContain("hunter2");
		expect(output).not.toContain("p4ss");
		expect(output).not.toContain("db-pass-9f3");
	});
});
