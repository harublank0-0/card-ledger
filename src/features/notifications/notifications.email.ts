import { type CurrencyCode, formatMoney } from "#/lib/money";

import type { Reminder } from "./notifications.logic";

/** Intl uses non-breaking spaces; plain text email should not carry invisible characters. */
function plainSpaces(value: string) {
	return value.replace(/\u00a0/g, " ");
}

function when(daysUntil: number) {
	if (daysUntil === 0) return "today";
	if (daysUntil === 1) return "tomorrow";
	return `in ${daysUntil} days`;
}

function line(r: Reminder) {
	const amount =
		r.amountMinor !== undefined && r.currency
			? ` (${plainSpaces(formatMoney(r.amountMinor, r.currency as CurrencyCode))})`
			: "";
	switch (r.kind) {
		case "SUBSCRIPTION_RENEWAL":
			return `${r.label} renews ${when(r.daysUntil)}, on ${r.eventDate}${amount}`;
		case "SUBSCRIPTION_EXPIRY":
			return `${r.label} expires ${when(r.daysUntil)}, on ${r.eventDate}`;
		case "CANCELLATION_DEADLINE":
			return `Cancel ${r.label} by ${r.eventDate} (${when(r.daysUntil)})`;
		case "CARD_PAYMENT_DUE":
			return `${r.label} •••• ${r.last4} payment is due ${when(r.daysUntil)}, on ${r.eventDate}`;
	}
}

/**
 * One digest email per user per run. Plain text only, and it contains just what the user
 * asked to be reminded about; no card numbers beyond the last four digits.
 */
export function renderDigest(input: {
	reminders: Reminder[];
	timezone: string;
	settingsUrl: string;
}) {
	const { reminders } = input;
	const first = reminders[0];
	if (!first) throw new Error("Nothing to send");

	const subject =
		reminders.length === 1
			? `Reminder: ${line(first)}`
			: `Card Ledger: ${reminders.length} upcoming reminders`;

	const text = [
		"Upcoming on Card Ledger:",
		"",
		...reminders.map((r) => `- ${line(r)}`),
		"",
		`Dates are in your time zone (${input.timezone}).`,
		`Change reminder settings: ${input.settingsUrl}`,
	].join("\n");

	return { subject, text };
}
