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
	const warn: Entry[] = [];
	const error: Entry[] = [];
	const exits: number[] = [];
	const deps = {
		production,
		log: {
			info: (msg: string, fields?: Record<string, unknown>) =>
				info.push({ msg, fields }),
			warn: (msg: string, fields?: Record<string, unknown>) =>
				warn.push({ msg, fields }),
			error: (msg: string, fields?: Record<string, unknown>) =>
				error.push({ msg, fields }),
		},
		exit: (code: number) => {
			exits.push(code);
		},
	};
	return { deps, info, warn, error, exits };
}

describe("checkStartupEnv", () => {
	it("accepts a valid environment and reports the effective policy once", () => {
		const { deps, info, warn, error, exits } = harness(true);
		const ok = checkStartupEnv(
			{ ...valid, SIGNUP_MODE: "closed", SMTP_HOST: "smtp.example.test" },
			deps,
		);
		expect(ok).toBe(true);
		expect(exits).toEqual([]);
		expect(error).toEqual([]);
		expect(warn).toEqual([]);
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

describe("checkStartupEnv: open sign-up with reminder email", () => {
	// Addresses are not verified, so with SIGNUP_MODE=open and an SMTP server anyone can
	// register any address and have reminders sent to it. The operator is told once at boot.
	const open = { ...valid, SIGNUP_MODE: "open" };

	it("warns once when sign-up is open and SMTP is configured, and still starts", () => {
		const { deps, info, warn, error, exits } = harness(true);
		const ok = checkStartupEnv(
			{ ...open, SMTP_HOST: "smtp.example.test" },
			deps,
		);
		expect(ok).toBe(true);
		expect(exits).toEqual([]);
		expect(error).toEqual([]);
		expect(info.map((entry) => entry.msg)).toEqual(["configuration valid"]);
		expect(warn).toHaveLength(1);
		expect(warn[0]?.msg).toContain("SIGNUP_MODE=open");
		expect(warn[0]?.msg).toContain("docs/self-hosting.md");
		expect(warn[0]?.fields).toEqual({ signupMode: "open", smtp: true });
	});

	it("is quiet when sign-up is open but no SMTP server is set", () => {
		const { deps, warn } = harness(true);
		checkStartupEnv(open, deps);
		expect(warn).toEqual([]);
	});

	it("is quiet for first-user and closed even with SMTP", () => {
		for (const mode of ["first-user", "closed"]) {
			const { deps, warn } = harness(true);
			checkStartupEnv(
				{ ...valid, SIGNUP_MODE: mode, SMTP_HOST: "smtp.example.test" },
				deps,
			);
			expect(warn, mode).toEqual([]);
		}
	});

	it("treats an empty SMTP_HOST as unset", () => {
		const { deps, warn } = harness(true);
		checkStartupEnv({ ...open, SMTP_HOST: "" }, deps);
		expect(warn).toEqual([]);
	});

	it("warns outside production too, without exiting", () => {
		const { deps, warn, exits } = harness(false);
		checkStartupEnv({ ...open, SMTP_HOST: "smtp.example.test" }, deps);
		expect(warn).toHaveLength(1);
		expect(exits).toEqual([]);
	});

	it("does not warn about an environment it refuses to start with", () => {
		const { deps, warn } = harness(true);
		checkStartupEnv(
			{ SIGNUP_MODE: "open", SMTP_HOST: "smtp.example.test" },
			deps,
		);
		expect(warn).toEqual([]);
	});

	it("never logs the SMTP host or any other value", () => {
		const { deps, warn } = harness(true);
		checkStartupEnv(
			{
				...open,
				SMTP_HOST: "smtp.internal-p4ss.example",
				SMTP_PASSWORD: "relay-hunter2",
			},
			deps,
		);
		const output = JSON.stringify(warn);
		expect(output).not.toContain("internal-p4ss");
		expect(output).not.toContain("hunter2");
	});
});
