import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { checkHealth, readExpectedMigrations } from "./health.service.server";

const REAL_MIGRATIONS = path.resolve(process.cwd(), "prisma", "migrations");
let scratch: string;

beforeAll(async () => {
	scratch = await mkdtemp(path.join(tmpdir(), "card-ledger-health-"));
});
afterAll(async () => {
	await rm(scratch, { recursive: true, force: true });
});

describe("readExpectedMigrations", () => {
	it("lists migration directories in order and ignores other files", async () => {
		const dir = path.join(scratch, "ordered");
		await mkdir(path.join(dir, "20260102000000_second"), { recursive: true });
		await mkdir(path.join(dir, "20260101000000_first"), { recursive: true });
		await writeFile(path.join(dir, "migration_lock.toml"), 'provider = "x"');

		expect(await readExpectedMigrations(dir)).toEqual([
			"20260101000000_first",
			"20260102000000_second",
		]);
	});

	it("returns null when the directory does not exist", async () => {
		expect(
			await readExpectedMigrations(path.join(scratch, "does-not-exist")),
		).toBeNull();
	});
});

describe("checkHealth (real database)", () => {
	it("is healthy against a database migrated from this repository", async () => {
		const result = await checkHealth({ migrationsDir: REAL_MIGRATIONS });
		expect(result).toEqual({
			ok: true,
			checks: { database: "ok", migrations: "ok" },
		});
	});

	it("reports pending when this build ships a migration the database lacks", async () => {
		const dir = path.join(scratch, "newer");
		await mkdir(path.join(dir, "29990101000000_not_applied"), {
			recursive: true,
		});
		const result = await checkHealth({ migrationsDir: dir });
		expect(result.ok).toBe(false);
		expect(result.checks).toEqual({ database: "ok", migrations: "pending" });
	});

	it("still answers when the migrations directory is missing", async () => {
		const result = await checkHealth({
			migrationsDir: path.join(scratch, "missing"),
		});
		expect(result.ok).toBe(true);
	});

	it("reports the database as failing instead of hanging when it does not answer", async () => {
		const hangs = {
			$queryRaw: () => new Promise<never>(() => {}),
		};
		const started = Date.now();
		const result = await checkHealth({
			migrationsDir: REAL_MIGRATIONS,
			client: hangs,
			timeoutMs: 50,
		});
		expect(Date.now() - started).toBeLessThan(1000);
		expect(result).toEqual({
			ok: false,
			checks: { database: "fail", migrations: "fail" },
		});
	});

	it("reports the database as failing when it rejects the query", async () => {
		const broken = {
			$queryRaw: async () => {
				throw new Error("connection refused");
			},
		};
		const result = await checkHealth({
			migrationsDir: REAL_MIGRATIONS,
			client: broken,
		});
		expect(result.ok).toBe(false);
		expect(result.checks.database).toBe("fail");
	});
});
