import { prisma } from "#/db";
import { listStatements } from "#/features/statements/statements.service.server";
import { monthlyCommitments } from "#/features/subscriptions/subscriptions.logic";
import { listSubscriptions } from "#/features/subscriptions/subscriptions.service.server";
import {
	netByCurrency,
	type TotalsRow,
} from "#/features/transactions/transactions.logic";
import { listRecentTransactions } from "#/features/transactions/transactions.service.server";
import type { CalendarDate } from "#/lib/calendar-date";
import { toDbDate } from "#/lib/db-dates";

import {
	isValidMonth,
	type Month,
	monthBounds,
	monthOf,
	shiftMonth,
	spendingByCategory,
	upcomingEvents,
} from "./dashboard.logic";

/** Every query is scoped by `userId`; archived records stay in historical totals. */

export const RECENT_TRANSACTIONS = 5;

/**
 * The month shown: the requested one if valid and not in the future, otherwise the current
 * month in the user's time zone (derived from `today`).
 */
export function resolveMonth(
	requested: string | undefined,
	today: CalendarDate,
): Month {
	const current = monthOf(today);
	return requested && isValidMonth(requested) && requested <= current
		? requested
		: current;
}

export async function getDashboard(
	userId: string,
	options: { today: CalendarDate; month?: string },
) {
	const { today } = options;
	const currentMonth = monthOf(today);
	const month = resolveMonth(options.month, today);
	const bounds = monthBounds(month);

	const [
		subscriptions,
		statementList,
		cards,
		groups,
		categories,
		recent,
		transactionCount,
	] = await Promise.all([
		listSubscriptions(userId, { today }),
		listStatements(userId, { includePaid: false, today }),
		prisma.paymentMethod.findMany({
			where: { userId, archivedAt: null },
			include: { _count: { select: { statements: true } } },
		}),
		prisma.transaction.groupBy({
			by: ["categoryId", "currency", "type"],
			where: {
				userId,
				occurredOn: { gte: toDbDate(bounds.start), lte: toDbDate(bounds.end) },
			},
			_sum: { amountMinor: true },
		}),
		prisma.category.findMany({
			where: { userId },
			select: { id: true, name: true },
		}),
		listRecentTransactions(userId, RECENT_TRANSACTIONS),
		prisma.transaction.count({ where: { userId } }),
	]);

	const categoryGroups = groups.map((g) => ({
		categoryId: g.categoryId,
		currency: g.currency,
		type: g.type,
		sumMinor: g._sum.amountMinor ?? 0,
	}));
	const totalsRows: TotalsRow[] = categoryGroups.map((g) => ({
		currency: g.currency,
		type: g.type,
		sumMinor: g.sumMinor,
	}));

	const unpaid = statementList.statements;
	return {
		today,
		month,
		previousMonth: shiftMonth(month, -1),
		nextMonth: month < currentMonth ? shiftMonth(month, 1) : null,
		isCurrentMonth: month === currentMonth,
		// Statement payments are not transactions, so they can never appear in spending.
		spending: netByCurrency(totalsRows),
		byCategory: spendingByCategory(
			categoryGroups,
			new Map(categories.map((c) => [c.id, c.name])),
		),
		subscriptions: {
			activeCount: subscriptions.filter((s) => s.state === "ACTIVE").length,
			commitments: monthlyCommitments(subscriptions),
		},
		owed: {
			outstanding: statementList.outstanding,
			overdueCount: unpaid.filter((s) => s.status === "OVERDUE").length,
		},
		upcoming: upcomingEvents({
			today,
			subscriptions,
			statements: unpaid.map((s) => ({
				id: s.id,
				cardName: s.card.name,
				last4: s.card.last4,
				dueDate: s.dueDate,
				outstandingMinor: s.outstandingMinor,
				currency: s.currency,
			})),
			cards: cards.map((c) => ({
				id: c.id,
				name: c.name,
				last4: c.last4,
				paymentDueDay: c.paymentDueDay,
				hasStatements: c._count.statements > 0,
			})),
		}),
		recent,
		counts: {
			cards: cards.length,
			subscriptions: subscriptions.length,
			transactions: transactionCount,
		},
	};
}
