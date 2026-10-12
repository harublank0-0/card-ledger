import { prisma } from "#/db";

/** The advisory-lock key; exported so a test can hold it from a second connection. */
export const FIRST_USER_SIGNUP_LOCK = "card-ledger:first-user-signup";
const LOCK_TIMEOUT_MS = 30_000;

// Requests of this process queue here, so at most one of them waits on the database lock and
// holds a pooled connection for it. Without this, a burst larger than the connection pool
// would leave the request that owns the lock unable to get the connection it needs to finish.
let queue: Promise<unknown> = Promise.resolve();

function inThisProcess<T>(run: () => Promise<T>): Promise<T> {
	const result = queue.then(run, run);
	queue = result.catch(() => undefined);
	return result;
}

/**
 * Run a first-user sign-up so that two at once cannot both see "no users yet". The check
 * ("is registration still open?") and the insert it protects are in different statements, so
 * the whole request is wrapped in a Postgres advisory lock: the second request waits until the
 * first has created its user, then sees one user and is refused by the normal policy.
 *
 * Once any user exists nothing needs serialising, so those requests skip the lock and are
 * refused immediately; a flood of sign-ups on an established instance never queues.
 */
export async function serializeFirstUserSignUp<T>(
	run: () => Promise<T>,
): Promise<T> {
	if ((await prisma.user.count()) > 0) return run();

	return inThisProcess(() =>
		prisma.$transaction(
			async (tx) => {
				// executeRaw, not queryRaw: the function returns `void`, which Prisma cannot read back.
				await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${FIRST_USER_SIGNUP_LOCK}::text))`;
				return run();
			},
			{ maxWait: LOCK_TIMEOUT_MS, timeout: LOCK_TIMEOUT_MS },
		),
	);
}
