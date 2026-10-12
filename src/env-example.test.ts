import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { describeEnvProblems, serverEnvSchema } from "./env.schema";

const root = process.cwd();
const example = readFileSync(path.join(root, ".env.example"), "utf8");
const compose = readFileSync(path.join(root, "compose.yaml"), "utf8");

/** `KEY=value` lines. Optional settings are shipped commented out (`# KEY=value`). */
function parse(text: string) {
	const assigned = new Map<string, string>();
	const documented = new Set<string>();
	for (const line of text.split("\n")) {
		const match = line.match(/^(#\s*)?([A-Z][A-Z0-9_]*)=(.*)$/);
		if (!match) continue;
		documented.add(match[2]);
		if (!match[1]) assigned.set(match[2], match[3].replace(/^"(.*)"$/, "$1"));
	}
	return { assigned, documented };
}

const { assigned, documented } = parse(example);

// DATABASE_URL is built by compose from POSTGRES_PASSWORD, so operators never set it.
const DERIVED = new Set(["DATABASE_URL"]);
// Nothing is internal any more: CARD_LEDGER_IMAGE selects a prebuilt image and is documented.
const INTERNAL = new Set<string>();

describe(".env.example", () => {
	it("documents every server setting an operator can choose", () => {
		const missing = Object.keys(serverEnvSchema).filter(
			(key) => !DERIVED.has(key) && !documented.has(key),
		);
		expect(missing).toEqual([]);
	});

	it("documents every variable compose.yaml reads", () => {
		const used = new Set(
			[...compose.matchAll(/\$\{([A-Z][A-Z0-9_]*)/g)].map((match) => match[1]),
		);
		const missing = [...used].filter(
			(key) => !INTERNAL.has(key) && !documented.has(key),
		);
		expect(missing).toEqual([]);
	});

	it("does not set DATABASE_URL, which would be ignored and misleading", () => {
		expect(assigned.has("DATABASE_URL")).toBe(false);
	});

	it("ships every secret empty, so an unedited copy is not bootable", () => {
		for (const key of [
			"POSTGRES_PASSWORD",
			"BETTER_AUTH_SECRET",
			"SMTP_PASSWORD",
			"SMTP_USER",
		]) {
			expect(assigned.get(key) ?? "", key).toBe("");
		}
		expect(documented.has("POSTGRES_PASSWORD")).toBe(true);
		expect(documented.has("BETTER_AUTH_SECRET")).toBe(true);
	});

	it("contains no URL with embedded credentials", () => {
		expect(example).not.toMatch(/[a-z]+:\/\/[^\s/:@]+:[^\s/@]+@/i);
	});

	it("only ships values the server accepts", () => {
		const values: Record<string, string> = {};
		for (const [key, value] of assigned) values[key] = value;
		// Fill what compose derives or the operator must supply.
		values.DATABASE_URL = "postgresql://cardledger:x@db:5432/cardledger";
		values.BETTER_AUTH_URL ??= "http://localhost:3000";
		values.BETTER_AUTH_SECRET = "x".repeat(32);
		expect(describeEnvProblems(values)).toEqual([]);
	});
});
