import { prisma } from "#/db";
import { env } from "#/env";
import { outstandingMinor } from "#/features/statements/statements.logic";
import { type CalendarDate, safeTimeZone, todayIn } from "#/lib/calendar-date";
import { fromDbDate, toDbDate } from "#/lib/db-dates";
import { errorClass, logger } from "#/lib/logger.server";
import type { Mailer } from "#/lib/mailer.server";
import { renderDigest } from "./notifications.email";
import {
	computeReminders,
	type PlannerCard,
	type PlannerStatement,
	type PlannerSubscription,
	type Reminder,
} from "./notifications.logic";
import type { NotificationPreferencesData } from "./notifications.schemas";

/**
 * Preferences are created lazily with defaults the first time they are needed. Several callers
 * (page view, overlapping cron runs) can hit a new user at once, so the insert ignores
 * conflicts (ON CONFLICT DO NOTHING) and the row is read back afterwards.
 */
export async function getPreferences(userId: string) {
	let row = await prisma.notificationPreference.findUnique({
		where: { userId },
	});
	if (!row) {
		await prisma.notificationPreference.createMany({
			data: [{ userId, timezone: env.DEFAULT_TIMEZONE }],
			skipDuplicates: true,
		});
		row = await prisma.notificationPreference.findUniqueOrThrow({
			where: { userId },
		});
	}
	// Rows written while DEFAULT_TIMEZONE was unvalidated can hold a zone `todayIn` rejects.
	// Read them as the instance default instead of failing every page and the reminder run.
	return {
		...row,
		timezone: safeTimeZone(row.timezone, env.DEFAULT_TIMEZONE),
	};
}

export async function updatePreferences(
	userId: string,
	data: NotificationPreferencesData,
) {
	return prisma.notificationPreference.upsert({
		where: { userId },
		create: { userId, ...data },
		update: data,
	});
}

/** "Today" in the user's own time zone. */
export async function getUserToday(userId: string, now = new Date()) {
	const prefs = await getPreferences(userId);
	return todayIn(prefs.timezone, now);
}

// ---------------------------------------------------------------------------
// Reminder runner
// ---------------------------------------------------------------------------

export const MAX_ATTEMPTS = 5;
const STALE_CLAIM_MS = 15 * 60 * 1000;
const BACKOFF_MS = [
	15 * 60_000,
	60 * 60_000,
	4 * 60 * 60_000,
	12 * 60 * 60_000,
];

function backoffAfter(attempts: number) {
	return (
		BACKOFF_MS[Math.min(attempts - 1, BACKOFF_MS.length - 1)] ?? BACKOFF_MS[0]
	);
}

/**
 * Claim the right to send one reminder. Returns the log id when this run owns it, or null
 * when it was already sent, is being sent by another run, or is not due for a retry yet.
 * The unique key makes the insert the atomic claim, so overlapping runs cannot double-send.
 */
async function claim(userId: string, reminder: Reminder, now: Date) {
	const key = {
		userId,
		kind: reminder.kind,
		entityId: reminder.entityId,
		eventDate: toDbDate(reminder.eventDate),
		offsetDays: reminder.offsetDays,
		channel: "email",
	};
	// INSERT ... ON CONFLICT DO NOTHING: still one atomic winner under concurrent runs, but a
	// reminder that was already claimed is a quiet no-op instead of a unique-violation error
	// (which PostgreSQL logs for every such attempt, hourly, for every sent reminder).
	const { count: inserted } = await prisma.notificationLog.createMany({
		data: [key],
		skipDuplicates: true,
	});
	const existing = await prisma.notificationLog.findUnique({
		where: { userId_kind_entityId_eventDate_offsetDays_channel: key },
	});
	if (!existing) return null;
	if (inserted === 1) return existing.id;

	const retryDue =
		existing.status === "FAILED" &&
		existing.attempts < MAX_ATTEMPTS &&
		existing.nextAttemptAt !== null &&
		existing.nextAttemptAt <= now;
	const staleClaim =
		existing.status === "PENDING" &&
		existing.updatedAt.getTime() < now.getTime() - STALE_CLAIM_MS;
	if (!retryDue && !staleClaim) return null;

	// Optimistic lock on updatedAt: only one concurrent run wins the re-claim.
	const { count } = await prisma.notificationLog.updateMany({
		where: {
			id: existing.id,
			status: existing.status,
			updatedAt: existing.updatedAt,
		},
		data: { status: "PENDING", nextAttemptAt: null },
	});
	return count === 1 ? existing.id : null;
}

async function loadPlannerData(userId: string) {
	const [subs, cards, statements] = await Promise.all([
		prisma.subscription.findMany({
			where: { userId, archivedAt: null, status: "ACTIVE" },
		}),
		prisma.paymentMethod.findMany({
			where: { userId, archivedAt: null },
			include: { _count: { select: { statements: true } } },
		}),
		prisma.cardStatement.findMany({
			where: { userId, paymentMethod: { archivedAt: null } },
			include: {
				paymentMethod: { select: { name: true, last4: true } },
				payments: { select: { amountMinor: true } },
			},
		}),
	]);
	const subscriptions: PlannerSubscription[] = subs.map((s) => ({
		id: s.id,
		name: s.name,
		amountMinor: s.amountMinor,
		currency: s.currency,
		anchorDate: fromDbDate(s.anchorDate),
		intervalCount: s.intervalCount,
		intervalUnit: s.intervalUnit,
		status: s.status,
		autoRenew: s.autoRenew,
		expiresOn: s.expiresOn ? fromDbDate(s.expiresOn) : null,
		cancellationDeadline: s.cancellationDeadline
			? fromDbDate(s.cancellationDeadline)
			: null,
	}));
	const plannerCards: PlannerCard[] = cards.map((c) => ({
		id: c.id,
		name: c.name,
		last4: c.last4,
		paymentDueDay: c.paymentDueDay,
		hasStatements: c._count.statements > 0,
	}));
	const unpaidStatements: PlannerStatement[] = statements
		.map((st) => ({
			id: st.id,
			cardName: st.paymentMethod.name,
			last4: st.paymentMethod.last4,
			dueDate: fromDbDate(st.dueDate),
			currency: st.currency,
			outstandingMinor: outstandingMinor(
				st.statementBalanceMinor,
				st.payments.reduce((sum, p) => sum + p.amountMinor, 0),
			),
		}))
		.filter((st) => st.outstandingMinor > 0);
	return {
		subscriptions,
		cards: plannerCards,
		statements: unpaidStatements,
	};
}

export type RunSummary = {
	users: number;
	reminders: number;
	sent: number;
	failed: number;
};

/**
 * Plan, claim, and send reminders for every user: one digest email per user per run.
 * Safe to run as often as you like (cron); duplicates are prevented by the log's unique key.
 */
export async function runReminders(options: {
	mailer: Mailer;
	settingsUrl: string;
	now?: Date;
}): Promise<RunSummary> {
	const now = options.now ?? new Date();
	const summary: RunSummary = { users: 0, reminders: 0, sent: 0, failed: 0 };
	const users = await prisma.user.findMany({
		select: { id: true, email: true },
	});

	const remindUser = async (user: { id: string; email: string }) => {
		const prefs = await getPreferences(user.id);
		if (!prefs.emailEnabled) return;
		summary.users++;

		const today: CalendarDate = todayIn(prefs.timezone, now);
		const planned = computeReminders({
			today,
			prefs,
			...(await loadPlannerData(user.id)),
		});

		const owned: { reminder: Reminder; logId: string }[] = [];
		for (const reminder of planned) {
			const logId = await claim(user.id, reminder, now);
			if (logId) owned.push({ reminder, logId });
		}
		if (owned.length === 0) return;
		summary.reminders += owned.length;

		const ids = owned.map((o) => o.logId);
		try {
			const { subject, text } = renderDigest({
				reminders: owned.map((o) => o.reminder),
				timezone: prefs.timezone,
				settingsUrl: options.settingsUrl,
			});
			await options.mailer.send({ to: user.email, subject, text });
			await prisma.notificationLog.updateMany({
				where: { id: { in: ids } },
				data: {
					status: "SENT",
					sentAt: now,
					lastError: null,
					nextAttemptAt: null,
				},
			});
			summary.sent += owned.length;
		} catch (error) {
			// Only a short code is stored: never message bodies or financial details.
			const code =
				typeof error === "object" && error !== null && "code" in error
					? String((error as { code: unknown }).code).slice(0, 40)
					: "SEND_FAILED";
			for (const { logId } of owned) {
				const row = await prisma.notificationLog.findUniqueOrThrow({
					where: { id: logId },
					select: { attempts: true },
				});
				const attempts = row.attempts + 1;
				await prisma.notificationLog.update({
					where: { id: logId },
					data: {
						status: "FAILED",
						attempts,
						lastError: code,
						nextAttemptAt:
							attempts < MAX_ATTEMPTS
								? new Date(now.getTime() + backoffAfter(attempts))
								: null,
					},
				});
			}
			summary.failed += owned.length;
		}
	};

	for (const user of users) {
		try {
			await remindUser(user);
		} catch (error) {
			// One user's failure must not stop the run for everyone after them. Anything this
			// user had claimed stays PENDING and is taken over by a later run. Class only: an
			// error message can carry details we never log.
			logger.error("reminder run failed for one user", {
				error: errorClass(error),
			});
			summary.failed++;
		}
	}
	return summary;
}
