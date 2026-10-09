import {
	addDays,
	addMonths,
	type CalendarDate,
	compareCalendarDates,
	diffInDays,
	diffInMonthIndex,
} from "#/lib/calendar-date";

export type BillingUnit = "WEEK" | "MONTH" | "YEAR";
export type SubscriptionStatus = "ACTIVE" | "CANCELLED";

export type Recurrence = {
	anchorDate: CalendarDate;
	intervalCount: number;
	intervalUnit: BillingUnit;
};

/**
 * The n-th billing date (n = 0 is the anchor). Always computed from the anchor, never by
 * chaining from the previous date, so month-end clamping does not drift
 * (Jan 31 -> Feb 28 -> Mar 31, not Mar 28).
 */
export function occurrenceAt(recurrence: Recurrence, n: number): CalendarDate {
	const { anchorDate, intervalCount, intervalUnit } = recurrence;
	switch (intervalUnit) {
		case "WEEK":
			return addDays(anchorDate, 7 * intervalCount * n);
		case "MONTH":
			return addMonths(anchorDate, intervalCount * n);
		case "YEAR":
			return addMonths(anchorDate, 12 * intervalCount * n);
	}
}

type Step = { kind: "days" | "months"; size: number };

function stepSize(recurrence: Recurrence): Step {
	switch (recurrence.intervalUnit) {
		case "WEEK":
			return { kind: "days", size: 7 * recurrence.intervalCount };
		case "MONTH":
			return { kind: "months", size: recurrence.intervalCount };
		case "YEAR":
			return { kind: "months", size: 12 * recurrence.intervalCount };
	}
}

/** Index of the first occurrence on or after `from` (0 if `from` is before the anchor). */
function firstIndexOnOrAfter(recurrence: Recurrence, from: CalendarDate) {
	if (compareCalendarDates(from, recurrence.anchorDate) <= 0) return 0;
	const step = stepSize(recurrence);
	// Estimate, then back off one and walk forward; clamping can only shift by < 1 step.
	const elapsed =
		step.kind === "days"
			? diffInDays(recurrence.anchorDate, from)
			: diffInMonthIndex(recurrence.anchorDate, from);
	let n = Math.max(0, Math.floor(elapsed / step.size) - 1);
	while (compareCalendarDates(occurrenceAt(recurrence, n), from) < 0) n++;
	return n;
}

export type RenewalRules = {
	status: SubscriptionStatus;
	autoRenew: boolean;
	/** Last day the subscription is valid; no renewals are produced after it. */
	expiresOn?: CalendarDate | null;
};

/** Whether the subscription is expected to keep renewing at all. */
export function renews(rules: RenewalRules) {
	return rules.status === "ACTIVE" && rules.autoRenew;
}

/**
 * Upcoming expected renewal dates on or after `from`. These are expectations only and
 * must never be turned into completed transactions automatically.
 */
export function upcomingRenewals(
	recurrence: Recurrence,
	rules: RenewalRules,
	from: CalendarDate,
	limit = 1,
): CalendarDate[] {
	if (!renews(rules)) return [];
	const dates: CalendarDate[] = [];
	let n = firstIndexOnOrAfter(recurrence, from);
	while (dates.length < limit) {
		const date = occurrenceAt(recurrence, n);
		if (rules.expiresOn && compareCalendarDates(date, rules.expiresOn) > 0) {
			break;
		}
		dates.push(date);
		n++;
	}
	return dates;
}

export type SubscriptionState =
	| "ACTIVE"
	| "ENDS_SOON"
	| "NOT_RENEWING"
	| "CANCELLED"
	| "EXPIRED";

/** Display state derived from stored fields and today's date. */
export function subscriptionState(
	rules: RenewalRules,
	today: CalendarDate,
): SubscriptionState {
	if (rules.status === "CANCELLED") {
		// A cancelled plan can still be valid until its paid period ends.
		return rules.expiresOn && compareCalendarDates(rules.expiresOn, today) >= 0
			? "NOT_RENEWING"
			: "CANCELLED";
	}
	if (rules.expiresOn && compareCalendarDates(rules.expiresOn, today) < 0) {
		return "EXPIRED";
	}
	if (!rules.autoRenew) return "NOT_RENEWING";
	return "ACTIVE";
}

/**
 * Cost normalised to one month, in minor units, rounded half up. Weeks use 52/12 weeks per
 * month. Only for summaries; never use it to record what was actually charged.
 */
export function monthlyEquivalentMinor(
	amountMinor: number,
	intervalCount: number,
	intervalUnit: BillingUnit,
) {
	let numerator: number;
	let denominator: number;
	switch (intervalUnit) {
		case "WEEK":
			numerator = amountMinor * 52;
			denominator = 12 * intervalCount;
			break;
		case "MONTH":
			numerator = amountMinor;
			denominator = intervalCount;
			break;
		case "YEAR":
			numerator = amountMinor;
			denominator = 12 * intervalCount;
			break;
	}
	return Math.floor((2 * numerator + denominator) / (2 * denominator));
}

/** Human label for an interval, e.g. "Monthly", "Every 3 months", "Yearly". */
export function describeInterval(count: number, unit: BillingUnit) {
	const names = { WEEK: "week", MONTH: "month", YEAR: "year" } as const;
	if (count === 1) {
		return { WEEK: "Weekly", MONTH: "Monthly", YEAR: "Yearly" }[unit];
	}
	if (count === 3 && unit === "MONTH") return "Quarterly";
	return `Every ${count} ${names[unit]}s`;
}
