import { describe, expect, it } from "vitest";

import { type AppliedMigration, evaluateHealth } from "./health.logic";

const done = (name: string): AppliedMigration => ({
	name,
	finishedAt: new Date("2026-10-09T06:20:33Z"),
	rolledBackAt: null,
});

const EXPECTED = ["20261009062033_init", "20261009062040_domain_checks"];

describe("evaluateHealth", () => {
	it("is healthy when the database answers and every expected migration is applied", () => {
		expect(
			evaluateHealth({
				databaseReachable: true,
				applied: EXPECTED.map(done),
				expected: EXPECTED,
			}),
		).toEqual({ ok: true, checks: { database: "ok", migrations: "ok" } });
	});

	it("is unhealthy when the database is unreachable, whatever else is known", () => {
		expect(
			evaluateHealth({
				databaseReachable: false,
				applied: null,
				expected: EXPECTED,
			}),
		).toEqual({ ok: false, checks: { database: "fail", migrations: "fail" } });
	});

	it("reports pending when an expected migration has not been applied", () => {
		const result = evaluateHealth({
			databaseReachable: true,
			applied: [done(EXPECTED[0])],
			expected: EXPECTED,
		});
		expect(result.ok).toBe(false);
		expect(result.checks).toEqual({ database: "ok", migrations: "pending" });
	});

	it("reports pending for a brand new database with no migrations table rows", () => {
		const result = evaluateHealth({
			databaseReachable: true,
			applied: [],
			expected: EXPECTED,
		});
		expect(result.checks.migrations).toBe("pending");
		expect(result.ok).toBe(false);
	});

	it("reports fail for a migration that started and never finished", () => {
		const result = evaluateHealth({
			databaseReachable: true,
			applied: [
				done(EXPECTED[0]),
				{ name: EXPECTED[1], finishedAt: null, rolledBackAt: null },
			],
			expected: EXPECTED,
		});
		expect(result.ok).toBe(false);
		expect(result.checks.migrations).toBe("fail");
	});

	it("prefers fail over pending when both apply", () => {
		const result = evaluateHealth({
			databaseReachable: true,
			applied: [{ name: EXPECTED[0], finishedAt: null, rolledBackAt: null }],
			expected: EXPECTED,
		});
		expect(result.checks.migrations).toBe("fail");
	});

	it("treats a rolled-back migration as not applied", () => {
		const result = evaluateHealth({
			databaseReachable: true,
			applied: [
				done(EXPECTED[0]),
				{
					name: EXPECTED[1],
					finishedAt: null,
					rolledBackAt: new Date("2026-10-10T00:00:00Z"),
				},
			],
			expected: EXPECTED,
		});
		expect(result.checks.migrations).toBe("pending");
		expect(result.ok).toBe(false);
	});

	it("does not fail because the database knows migrations this image does not", () => {
		const result = evaluateHealth({
			databaseReachable: true,
			applied: [...EXPECTED.map(done), done("20270101000000_newer")],
			expected: EXPECTED,
		});
		expect(result.ok).toBe(true);
	});

	it("fails when the migrations table cannot be read although the database answers", () => {
		const result = evaluateHealth({
			databaseReachable: true,
			applied: null,
			expected: EXPECTED,
		});
		expect(result.ok).toBe(false);
		expect(result.checks).toEqual({ database: "ok", migrations: "fail" });
	});

	describe("when the migrations directory is not available", () => {
		it("is healthy if nothing is unfinished", () => {
			expect(
				evaluateHealth({
					databaseReachable: true,
					applied: EXPECTED.map(done),
					expected: null,
				}).ok,
			).toBe(true);
		});

		it("still fails on an unfinished migration", () => {
			expect(
				evaluateHealth({
					databaseReachable: true,
					applied: [{ name: "x", finishedAt: null, rolledBackAt: null }],
					expected: null,
				}).checks.migrations,
			).toBe("fail");
		});
	});
});
