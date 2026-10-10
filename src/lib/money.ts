import { z } from "zod";

/**
 * Money is an integer count of minor units (paisa, cents) plus an ISO 4217 currency code.
 * Floating point is never used for stored or summed values.
 */

/** Minor-unit exponent per supported currency (NPR 2 => 1 NPR = 100 paisa). */
export const CURRENCIES = {
	NPR: 2,
	USD: 2,
	EUR: 2,
	GBP: 2,
	INR: 2,
	AUD: 2,
	CAD: 2,
	SGD: 2,
	AED: 2,
	JPY: 0,
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export const currencySchema = z.enum(
	CURRENCY_CODES as [CurrencyCode, ...CurrencyCode[]],
);

/** Largest amount storable in a Postgres INT column. */
export const MAX_MINOR = 2_147_483_647;

export function isSupportedCurrency(value: string): value is CurrencyCode {
	return Object.hasOwn(CURRENCIES, value);
}

export function exponentOf(currency: CurrencyCode) {
	return CURRENCIES[currency];
}

/**
 * Parse user input like "1,299.50" into minor units without any float math.
 * Rejects negatives, more decimals than the currency allows, and non-numbers.
 */
export function parseMoney(input: string, currency: CurrencyCode): number {
	const exponent = exponentOf(currency);
	const text = input.trim();
	// A comma is only ever digit grouping: 1,299.50, or 12,34,567 in the South Asian style.
	// It must never be silently dropped: "12,50" typed with a decimal comma would otherwise
	// become 1250.00, a hundredfold error that no later check can notice.
	const match =
		/^(\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})+,\d{3})(?:\.(\d+))?$/.exec(
			text,
		);
	if (!match) {
		throw new Error(
			text.includes(",")
				? "Use a dot for decimals, e.g. 499.50. A comma can only separate thousands, as in 1,299.50"
				: "Enter a valid amount, e.g. 499.00",
		);
	}
	const whole = match[1].replace(/,/g, "");
	const fraction = match[2] ?? "";
	if (fraction.length > exponent) {
		throw new Error(
			exponent === 0
				? `${currency} does not use decimals`
				: `${currency} supports at most ${exponent} decimal places`,
		);
	}
	const minor = Number(whole + fraction.padEnd(exponent, "0"));
	if (!Number.isSafeInteger(minor) || minor > MAX_MINOR) {
		throw new Error("Amount is too large");
	}
	return minor;
}

/** Plain decimal string for editing forms: 49900 NPR -> "499.00". Integer math only. */
export function minorToInputString(minor: number, currency: CurrencyCode) {
	const exponent = exponentOf(currency);
	if (exponent === 0) return String(minor);
	const text = String(Math.abs(minor)).padStart(exponent + 1, "0");
	const sign = minor < 0 ? "-" : "";
	return `${sign}${text.slice(0, -exponent)}.${text.slice(-exponent)}`;
}

/** Locale-aware display, e.g. "NPR 1,299.50". Display only; never feed back into math. */
export function formatMoney(
	minor: number,
	currency: CurrencyCode,
	locale = "en-US",
) {
	const exponent = exponentOf(currency);
	return new Intl.NumberFormat(locale, {
		style: "currency",
		currency,
		currencyDisplay: "code",
		minimumFractionDigits: exponent,
		maximumFractionDigits: exponent,
	}).format(minor / 10 ** exponent);
}

/** Sum amounts of one currency. Mixing currencies is a bug, so it throws. */
export function sumMinor(
	items: ReadonlyArray<{ amountMinor: number; currency: string }>,
	currency: string,
) {
	let total = 0;
	for (const item of items) {
		if (item.currency !== currency) {
			throw new Error(
				`Cannot add ${item.currency} to ${currency} without a conversion`,
			);
		}
		total += item.amountMinor;
	}
	return total;
}

/** Group totals by currency; currencies are never combined. */
export function totalsByCurrency(
	items: ReadonlyArray<{ amountMinor: number; currency: string }>,
) {
	const totals = new Map<string, number>();
	for (const item of items) {
		totals.set(
			item.currency,
			(totals.get(item.currency) ?? 0) + item.amountMinor,
		);
	}
	return totals;
}
