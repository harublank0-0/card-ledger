import { readdir } from "node:fs/promises";
import path from "node:path";

import { prisma } from "#/db";

import {
	type AppliedMigration,
	evaluateHealth,
	type HealthResult,
} from "./health.logic";

const DEFAULT_TIMEOUT_MS = 2000;

/** The slice of the Prisma client the check needs, so a test can stand in for it. */
type Queryable = {
	$queryRaw: <T = unknown>(
		query: TemplateStringsArray,
		...values: unknown[]
	) => PromiseLike<T>;
};

type MigrationRow = {
	migration_name: string;
	finished_at: Date | null;
	rolled_back_at: Date | null;
};

/**
 * Migration directory names shipped with this build, in order. Null when the directory is not
 * readable (for example the process was started from another working directory); the check
 * then only looks for failed migrations.
 */
export async function readExpectedMigrations(
	dir: string,
): Promise<string[] | null> {
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort();
	} catch {
		return null;
	}
}

function withTimeout<T>(work: PromiseLike<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new Error("timeout")), ms);
	});
	return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Readiness: can the database be queried, and has it applied every migration this build ships?
 * Touches no domain table and returns no per-user data.
 */
export async function checkHealth(
	options: {
		migrationsDir?: string;
		timeoutMs?: number;
		client?: Queryable;
	} = {},
): Promise<HealthResult> {
	const client = options.client ?? prisma;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const dir =
		options.migrationsDir ??
		path.resolve(process.cwd(), "prisma", "migrations");

	try {
		await withTimeout(client.$queryRaw`SELECT 1`, timeoutMs);
	} catch {
		return evaluateHealth({
			databaseReachable: false,
			applied: null,
			expected: null,
		});
	}

	let applied: AppliedMigration[] | null;
	try {
		const rows = await withTimeout(
			client.$queryRaw<
				MigrationRow[]
			>`SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations`,
			timeoutMs,
		);
		applied = rows.map((row) => ({
			name: row.migration_name,
			finishedAt: row.finished_at,
			rolledBackAt: row.rolled_back_at,
		}));
	} catch {
		applied = null;
	}

	return evaluateHealth({
		databaseReachable: true,
		applied,
		expected: await readExpectedMigrations(dir),
	});
}
