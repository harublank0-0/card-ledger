import {
	type BillingUnit,
	type SubscriptionStatus,
	upcomingRenewals,
} from "#/features/subscriptions/subscriptions.logic";
import {
	type CalendarDate,
	compareCalendarDates,
	diffInDays,
	nextMonthlyOccurrence,
} from "#/lib/calendar-date";

export type ReminderKind =
	| "SUBSCRIPTION_RENEWAL"
	| "SUBSCRIPTION_EXPIRY"
	| "CANCELLATION_DEADLINE"
	| "CARD_PAYMENT_DUE";

/** Offsets users may choose (days before an event; 0 = on the day). */
export const ALLOWED_OFFSETS = [0, 1, 2, 3, 5, 7, 14, 30] as const;
export const DEFAULT_OFFSETS = [7, 3, 1];

export type ReminderPrefs = {
	offsetsDays: number[];
	renewalEnabled: boolean;
	expiryEnabled: boolean;
	cancellationEnabled: boolean;
	paymentDueEnabled: boolean;
};

export type PlannerSubscription = {
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

export type PlannerCard = {
	id: string;
	name: string;
	last4: string;
	paymentDueDay: number | null;
};

export type Reminder = {
	kind: ReminderKind;
	entityId: string;
	/** The date being reminded about. */
	eventDate: CalendarDate;
	/** Threshold bucket this reminder belongs to; part of the dedupe key. */
	offsetDays: number;
	/** Actual days remaining; used for the email wording. */
	daysUntil: number;
	label: string;
	last4?: string;
	amountMinor?: number;
	currency?: string;
};

/**
 * The smallest configured offset that still covers `daysUntil`. After an outage (job did not
 * run for a day or two) this yields one up-to-date reminder instead of a burst of stale ones.
 */
export function bucketFor(daysUntil: number, offsets: readonly number[]) {
	let best: number | undefined;
	for (const offset of offsets) {
		if (offset >= daysUntil && (best === undefined || offset < best)) {
			best = offset;
		}
	}
	return best;
}

/**
 * Which reminders are due as of `today` (a calendar date in the user's time zone).
 * Pure: it neither reads the database nor knows what was already sent; the runner dedupes
 * on (kind, entityId, eventDate, offsetDays).
 * Cancelled subscriptions never produce reminders.
 */
export function computeReminders(input: {
	today: CalendarDate;
	prefs: ReminderPrefs;
	subscriptions: PlannerSubscription[];
	cards: PlannerCard[];
}): Reminder[] {
	const { today, prefs } = input;
	const reminders: Reminder[] = [];

	const add = (base: Omit<Reminder, "offsetDays" | "daysUntil">) => {
		const daysUntil = diffInDays(today, base.eventDate);
		if (daysUntil < 0) return;
		const offsetDays = bucketFor(daysUntil, prefs.offsetsDays);
		if (offsetDays === undefined) return;
		reminders.push({ ...base, offsetDays, daysUntil });
	};

	for (const s of input.subscriptions) {
		if (s.status === "CANCELLED") continue;
		const common = {
			entityId: s.id,
			label: s.name,
			amountMinor: s.amountMinor,
			currency: s.currency,
		};

		if (prefs.renewalEnabled) {
			const [next] = upcomingRenewals(
				s,
				{ status: s.status, autoRenew: s.autoRenew, expiresOn: s.expiresOn },
				today,
				1,
			);
			if (next) {
				add({ ...common, kind: "SUBSCRIPTION_RENEWAL", eventDate: next });
			}
		}
		if (prefs.expiryEnabled && s.expiresOn) {
			add({ ...common, kind: "SUBSCRIPTION_EXPIRY", eventDate: s.expiresOn });
		}
		if (prefs.cancellationEnabled && s.cancellationDeadline) {
			add({
				...common,
				kind: "CANCELLATION_DEADLINE",
				eventDate: s.cancellationDeadline,
			});
		}
	}

	if (prefs.paymentDueEnabled) {
		for (const card of input.cards) {
			if (card.paymentDueDay === null) continue;
			add({
				kind: "CARD_PAYMENT_DUE",
				entityId: card.id,
				label: card.name,
				last4: card.last4,
				eventDate: nextMonthlyOccurrence(card.paymentDueDay, today),
			});
		}
	}

	return reminders.sort(
		(a, b) =>
			compareCalendarDates(a.eventDate, b.eventDate) ||
			a.kind.localeCompare(b.kind) ||
			a.label.localeCompare(b.label),
	);
}

/** Stable identity used for dedupe and matching. */
export function reminderKey(
	r: Pick<Reminder, "kind" | "entityId" | "eventDate" | "offsetDays">,
) {
	return `${r.kind}|${r.entityId}|${r.eventDate}|${r.offsetDays}`;
}
