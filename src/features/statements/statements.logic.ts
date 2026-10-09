import {
	addDays,
	type CalendarDate,
	compareCalendarDates,
	diffInDays,
	nextMonthlyOccurrence,
	previousMonthlyOccurrence,
} from "#/lib/calendar-date";

export type StatementStatus = "PAID" | "OVERDUE" | "OPEN";

/** What is still owed on a statement. Never negative. */
export function outstandingMinor(balanceMinor: number, paidMinor: number) {
	return Math.max(0, balanceMinor - paidMinor);
}

/** Paid beyond the statement balance, shown as a credit. */
export function overpaidMinor(balanceMinor: number, paidMinor: number) {
	return Math.max(0, paidMinor - balanceMinor);
}

/**
 * Derived state of a statement. Based only on the bank's balance and the payments the user
 * recorded; manually entered expenses are never part of it.
 * A zero balance counts as paid. `daysUntilDue` is negative once the due date has passed.
 */
export function statementStatus(input: {
	balanceMinor: number;
	paidMinor: number;
	dueDate: CalendarDate;
	today: CalendarDate;
}) {
	const outstanding = outstandingMinor(input.balanceMinor, input.paidMinor);
	const daysUntilDue = diffInDays(input.today, input.dueDate);
	const status: StatementStatus =
		outstanding === 0 ? "PAID" : daysUntilDue < 0 ? "OVERDUE" : "OPEN";
	return {
		status,
		outstandingMinor: outstanding,
		overpaidMinor: overpaidMinor(input.balanceMinor, input.paidMinor),
		daysUntilDue,
	};
}

type Period = { start: CalendarDate; end: CalendarDate };

/** Inclusive date ranges: sharing a single day counts as overlapping. */
export function periodsOverlap(a: Period, b: Period) {
	return (
		compareCalendarDates(a.start, b.end) <= 0 &&
		compareCalendarDates(b.start, a.end) <= 0
	);
}

/**
 * Starting dates for the "add statement" form, from the card's configured days.
 * The period ends on the latest statement day on or before `today`, or, when a statement for
 * that period is already recorded, on the next statement day after the previous one. Returns
 * null when the card has no statement day. `dueDate` is null without a payment due day.
 */
export function suggestNextStatement(input: {
	card: { statementDay: number | null; paymentDueDay: number | null };
	previousPeriodEnd: CalendarDate | null;
	today: CalendarDate;
}): {
	periodStart: CalendarDate;
	periodEnd: CalendarDate;
	dueDate: CalendarDate | null;
} | null {
	const { statementDay, paymentDueDay } = input.card;
	if (statementDay === null) return null;

	let periodEnd = previousMonthlyOccurrence(statementDay, input.today);
	if (
		input.previousPeriodEnd &&
		compareCalendarDates(periodEnd, input.previousPeriodEnd) <= 0
	) {
		periodEnd = nextMonthlyOccurrence(
			statementDay,
			addDays(input.previousPeriodEnd, 1),
		);
	}
	// Without a recorded statement, the period starts the day after the previous statement day
	// (found from the real day, not by subtracting a month from a possibly clamped end).
	const periodStart = addDays(
		input.previousPeriodEnd ??
			previousMonthlyOccurrence(statementDay, addDays(periodEnd, -1)),
		1,
	);
	const dueDate =
		paymentDueDay === null
			? null
			: nextMonthlyOccurrence(paymentDueDay, addDays(periodEnd, 1));
	return { periodStart, periodEnd, dueDate };
}

/** Outstanding amounts per currency, largest-first stable by code; currencies never combined. */
export function outstandingByCurrency(
	rows: readonly { currency: string; outstandingMinor: number }[],
) {
	const totals = new Map<string, number>();
	for (const row of rows) {
		totals.set(
			row.currency,
			(totals.get(row.currency) ?? 0) + row.outstandingMinor,
		);
	}
	return [...totals.entries()]
		.filter(([, minor]) => minor > 0)
		.map(([currency, outstanding]) => ({
			currency,
			outstandingMinor: outstanding,
		}))
		.sort((a, b) => a.currency.localeCompare(b.currency));
}
