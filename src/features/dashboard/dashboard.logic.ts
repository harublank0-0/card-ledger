import {
	type CardPaymentDueEvent,
	cardPaymentDueEvents,
	type DueCard,
	type DueStatement,
} from "#/features/statements/statements.logic";
import {
	type BillingUnit,
	type SubscriptionStatus,
	upcomingRenewals,
} from "#/features/subscriptions/subscriptions.logic";
import {
	addDays,
	addMonths,
	type CalendarDate,
	compareCalendarDates,
	daysInMonth,
	diffInDays,
} from "#/lib/calendar-date";

// ---------------------------------------------------------------------------
// Months ("YYYY-MM"). Transactions carry calendar dates, so a month is simply the first to
// the last day; "the current month" comes from today's date in the user's own time zone.
// ---------------------------------------------------------------------------

export type Month = string;

export function isValidMonth(value: string): value is Month {
	const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
	return match !== null && Number(match[1]) >= 1900;
}

export function monthOf(date: CalendarDate): Month {
	return date.slice(0, 7);
}

export function monthBounds(month: Month): {
	start: CalendarDate;
	end: CalendarDate;
} {
	if (!isValidMonth(month)) throw new Error(`Invalid month: ${month}`);
	const year = Number(month.slice(0, 4));
	const monthNumber = Number(month.slice(5, 7));
	return {
		start: `${month}-01`,
		end: `${month}-${String(daysInMonth(year, monthNumber)).padStart(2, "0")}`,
	};
}

export function shiftMonth(month: Month, delta: number): Month {
	return monthOf(addMonths(`${month}-01`, delta));
}

/** "October 2026". Formatted in UTC so the server's own time zone can never shift it. */
export function formatMonthLabel(month: Month, locale = "en-US") {
	const year = Number(month.slice(0, 4));
	const monthNumber = Number(month.slice(5, 7));
	return new Intl.DateTimeFormat(locale, {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}

// ---------------------------------------------------------------------------
// Spending by category
// ---------------------------------------------------------------------------

export const UNCATEGORIZED_NAME = "Uncategorized";

export type CategoryGroup = {
	categoryId: string | null;
	currency: string;
	type: "EXPENSE" | "REFUND";
	sumMinor: number;
};

export type CategorySpend = {
	categoryId: string | null;
	name: string;
	spentMinor: number;
	refundedMinor: number;
	/** spent minus refunded; negative when refunds exceed spending in the month. */
	netMinor: number;
};

export type CurrencyBreakdown = {
	currency: string;
	rows: CategorySpend[];
	/** Net of all categories in this currency. */
	netMinor: number;
	/** The largest positive net, used to scale bars (0 when nothing is positive). */
	maxNetMinor: number;
};

/**
 * Net spending (expenses minus refunds) per category, separately for each currency.
 * Currencies are never combined. Archived categories keep their names because the caller
 * passes every category, archived included.
 */
export function spendingByCategory(
	groups: readonly CategoryGroup[],
	names: ReadonlyMap<string, string>,
): CurrencyBreakdown[] {
	const byCurrency = new Map<string, Map<string | null, CategorySpend>>();
	for (const g of groups) {
		const rows =
			byCurrency.get(g.currency) ?? new Map<string | null, CategorySpend>();
		const row =
			rows.get(g.categoryId) ??
			({
				categoryId: g.categoryId,
				name:
					g.categoryId === null
						? UNCATEGORIZED_NAME
						: (names.get(g.categoryId) ?? "Unknown category"),
				spentMinor: 0,
				refundedMinor: 0,
				netMinor: 0,
			} satisfies CategorySpend);
		if (g.type === "EXPENSE") row.spentMinor += g.sumMinor;
		else row.refundedMinor += g.sumMinor;
		row.netMinor = row.spentMinor - row.refundedMinor;
		rows.set(g.categoryId, row);
		byCurrency.set(g.currency, rows);
	}
	return [...byCurrency.entries()]
		.map(([currency, rowMap]) => {
			const rows = [...rowMap.values()].sort(
				(a, b) => b.netMinor - a.netMinor || a.name.localeCompare(b.name),
			);
			return {
				currency,
				rows,
				netMinor: rows.reduce((sum, r) => sum + r.netMinor, 0),
				maxNetMinor: Math.max(0, ...rows.map((r) => r.netMinor)),
			};
		})
		.sort((a, b) => a.currency.localeCompare(b.currency));
}

// ---------------------------------------------------------------------------
// Coming up
// ---------------------------------------------------------------------------

export const UPCOMING_HORIZON_DAYS = 30;

export type UpcomingKind =
	| "STATEMENT_OVERDUE"
	| "STATEMENT_DUE"
	| "CARD_DUE_DAY"
	| "RENEWAL"
	| "EXPIRY"
	| "CANCEL_BY";

export type UpcomingEvent = {
	kind: UpcomingKind;
	date: CalendarDate;
	/** Negative for overdue statements. */
	daysUntil: number;
	label: string;
	last4?: string;
	amountMinor?: number;
	currency?: string;
	target: { type: "subscription" | "statement" | "card"; id: string };
};

export type UpcomingSubscription = {
	id: string;
	name: string;
	amountMinor: number;
	currency: string;
	anchorDate: CalendarDate;
	intervalCount: number;
	intervalUnit: BillingUnit;
	status: SubscriptionStatus;
	autoRenew: boolean;
	expiresOn: CalendarDate | null;
	cancellationDeadline: CalendarDate | null;
};

const KIND_ORDER: UpcomingKind[] = [
	"STATEMENT_OVERDUE",
	"STATEMENT_DUE",
	"CARD_DUE_DAY",
	"CANCEL_BY",
	"RENEWAL",
	"EXPIRY",
];

/**
 * What needs attention in the next `horizonDays` days: renewals, expiries, cancel-by dates and
 * card payments (see `cardPaymentDueEvents`). Overdue statements come first regardless of
 * the horizon, most overdue first; everything else is ordered by date. Cancelled subscriptions
 * contribute nothing.
 */
export function upcomingEvents(input: {
	today: CalendarDate;
	horizonDays?: number;
	subscriptions: readonly UpcomingSubscription[];
	statements: readonly DueStatement[];
	cards: readonly DueCard[];
}): UpcomingEvent[] {
	const { today } = input;
	const last = addDays(today, input.horizonDays ?? UPCOMING_HORIZON_DAYS);
	const inWindow = (date: CalendarDate) =>
		compareCalendarDates(date, today) >= 0 &&
		compareCalendarDates(date, last) <= 0;
	const events: UpcomingEvent[] = [];

	for (const s of input.subscriptions) {
		if (s.status === "CANCELLED") continue;
		const common = {
			label: s.name,
			amountMinor: s.amountMinor,
			currency: s.currency,
			target: { type: "subscription", id: s.id } as const,
		};
		const [renewal] = upcomingRenewals(
			s,
			{ status: s.status, autoRenew: s.autoRenew, expiresOn: s.expiresOn },
			today,
			1,
		);
		if (renewal && inWindow(renewal)) {
			events.push({
				...common,
				kind: "RENEWAL",
				date: renewal,
				daysUntil: diffInDays(today, renewal),
			});
		}
		if (s.expiresOn && inWindow(s.expiresOn)) {
			events.push({
				...common,
				kind: "EXPIRY",
				date: s.expiresOn,
				daysUntil: diffInDays(today, s.expiresOn),
			});
		}
		if (s.cancellationDeadline && inWindow(s.cancellationDeadline)) {
			events.push({
				...common,
				kind: "CANCEL_BY",
				date: s.cancellationDeadline,
				daysUntil: diffInDays(today, s.cancellationDeadline),
			});
		}
	}

	const cardEvent = (e: CardPaymentDueEvent): UpcomingEvent | null => {
		const daysUntil = diffInDays(today, e.dueDate);
		const base = {
			date: e.dueDate,
			daysUntil,
			label: e.cardName,
			last4: e.last4,
			...(e.amountMinor !== undefined
				? { amountMinor: e.amountMinor, currency: e.currency }
				: {}),
		};
		if (e.source === "STATEMENT") {
			if (daysUntil < 0) {
				return {
					...base,
					kind: "STATEMENT_OVERDUE",
					target: { type: "statement", id: e.entityId },
				};
			}
			return inWindow(e.dueDate)
				? {
						...base,
						kind: "STATEMENT_DUE",
						target: { type: "statement", id: e.entityId },
					}
				: null;
		}
		return inWindow(e.dueDate)
			? {
					...base,
					kind: "CARD_DUE_DAY",
					target: { type: "card", id: e.entityId },
				}
			: null;
	};
	for (const e of cardPaymentDueEvents({
		today,
		cards: input.cards,
		statements: input.statements,
	})) {
		const event = cardEvent(e);
		if (event) events.push(event);
	}

	return events.sort((a, b) => {
		const aOverdue = a.kind === "STATEMENT_OVERDUE";
		const bOverdue = b.kind === "STATEMENT_OVERDUE";
		if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
		return (
			compareCalendarDates(a.date, b.date) ||
			KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) ||
			a.label.localeCompare(b.label)
		);
	});
}

// ---------------------------------------------------------------------------
// Presentation helpers (pure, so wording and bar widths are tested)
// ---------------------------------------------------------------------------

const daysPhrase = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

function whenPhrase(daysUntil: number) {
	return daysUntil === 0
		? "today"
		: daysUntil === 1
			? "tomorrow"
			: `in ${daysPhrase(daysUntil)}`;
}

/** One line of text and a tone for an upcoming event. Amounts are shown separately. */
export function describeUpcoming(event: UpcomingEvent): {
	text: string;
	tone: "danger" | "neutral";
} {
	const card = event.last4 ? `${event.label} •••• ${event.last4}` : event.label;
	const when = whenPhrase(event.daysUntil);
	switch (event.kind) {
		case "STATEMENT_OVERDUE":
			return {
				text: `${card}: payment overdue by ${daysPhrase(-event.daysUntil)}`,
				tone: "danger",
			};
		case "STATEMENT_DUE":
			return { text: `${card}: payment due ${when}`, tone: "neutral" };
		case "CARD_DUE_DAY":
			return {
				text: `${card}: payment due ${when} (monthly due day)`,
				tone: "neutral",
			};
		case "RENEWAL":
			return { text: `${event.label} renews ${when}`, tone: "neutral" };
		case "EXPIRY":
			return { text: `${event.label} expires ${when}`, tone: "neutral" };
		case "CANCEL_BY":
			return {
				text: `Cancel ${event.label} by ${event.date} (${when})`,
				tone: "neutral",
			};
	}
}

/**
 * Width of a category's bar as a whole percentage of the largest positive net. Categories with
 * no positive spending get no bar; a tiny but positive one still gets a visible sliver.
 */
export function barPercent(netMinor: number, maxNetMinor: number) {
	if (netMinor <= 0 || maxNetMinor <= 0) return 0;
	return Math.max(2, Math.min(100, Math.round((netMinor / maxNetMinor) * 100)));
}
