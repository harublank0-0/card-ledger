/** One row of Prisma's `_prisma_migrations` table, reduced to what health needs. */
export type AppliedMigration = {
	name: string;
	finishedAt: Date | null;
	rolledBackAt: Date | null;
};

export type HealthInput = {
	databaseReachable: boolean;
	/** Rows read from `_prisma_migrations`; null when the table could not be read. */
	applied: AppliedMigration[] | null;
	/** Migration directory names shipped with this build; null when not available. */
	expected: string[] | null;
};

export type HealthResult = {
	ok: boolean;
	checks: {
		database: "ok" | "fail";
		migrations: "ok" | "pending" | "fail";
	};
};

/**
 * Decide whether the instance is ready to serve. Pure: the caller does the I/O.
 *
 * - `fail`: the database cannot be queried, or a migration started and never finished.
 * - `pending`: this build ships a migration the database has not applied (or rolled back).
 * A database that is ahead of this build is not an error.
 */
export function evaluateHealth(input: HealthInput): HealthResult {
	if (!input.databaseReachable) {
		return { ok: false, checks: { database: "fail", migrations: "fail" } };
	}
	const { applied, expected } = input;
	if (applied === null) {
		return { ok: false, checks: { database: "ok", migrations: "fail" } };
	}

	const unfinished = applied.some(
		(row) => row.finishedAt === null && row.rolledBackAt === null,
	);
	if (unfinished) {
		return { ok: false, checks: { database: "ok", migrations: "fail" } };
	}

	if (expected !== null) {
		const done = new Set(
			applied
				.filter((row) => row.finishedAt !== null && row.rolledBackAt === null)
				.map((row) => row.name),
		);
		if (expected.some((name) => !done.has(name))) {
			return { ok: false, checks: { database: "ok", migrations: "pending" } };
		}
	}

	return { ok: true, checks: { database: "ok", migrations: "ok" } };
}
