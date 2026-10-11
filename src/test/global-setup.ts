import { execFileSync } from "node:child_process";
import pg from "pg";
import { loadEnv } from "vite";

/**
 * Integration tests run against a dedicated database (`<name>_test`) on the same server as
 * DATABASE_URL, created and migrated on demand. The development database is never touched.
 */
export default async function setup() {
	const fileEnv = loadEnv("test", process.cwd(), "");
	const baseUrl = process.env.DATABASE_URL ?? fileEnv.DATABASE_URL;
	if (!baseUrl)
		throw new Error("DATABASE_URL is required to run integration tests");

	const url = new URL(baseUrl);
	const testDb = `${url.pathname.slice(1)}_test`;
	if (!/^[a-z0-9_]+$/.test(testDb))
		throw new Error(`Unsafe test database name: ${testDb}`);

	const admin = new pg.Client({ connectionString: baseUrl });
	await admin.connect();
	const exists = await admin.query(
		"select 1 from pg_database where datname = $1",
		[testDb],
	);
	if (exists.rowCount === 0) await admin.query(`create database "${testDb}"`);
	await admin.end();

	url.pathname = `/${testDb}`;
	const testUrl = url.toString();

	execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
		env: { ...process.env, DATABASE_URL: testUrl, CHECKPOINT_DISABLE: "1" },
		stdio: "pipe",
	});

	// Workers are forked after this point and inherit these.
	process.env.DATABASE_URL = testUrl;
	process.env.BETTER_AUTH_URL ??= "http://localhost:3100";
	process.env.BETTER_AUTH_SECRET ??=
		"test-secret-test-secret-test-secret-123456";
}
