import { type CurrencyCode, formatMoney } from "#/lib/money";

export type TransactionType = "EXPENSE" | "REFUND";

type MoneyLike = { amountMinor: number; currency: string };

const show = (minor: number, currency: string) =>
	formatMoney(minor, currency as CurrencyCode).replace(/ /g, " ");

/** How much of an expense can still be refunded. */
export function refundableRemaining(
	original: Pick<MoneyLike, "amountMinor">,
	alreadyRefundedMinor: number,
) {
	return Math.max(0, original.amountMinor - alreadyRefundedMinor);
}

/**
 * Whether a refund of `amountMinor` may be recorded against `original`.
 * Returns a user-facing message, or null when the refund is acceptable.
 * `alreadyRefundedMinor` is the sum of the other refunds of the same expense.
 */
export function validateRefund(input: {
	original: MoneyLike & { type: TransactionType };
	alreadyRefundedMinor: number;
	amountMinor: number;
	currency: string;
}): string | null {
	const { original, alreadyRefundedMinor, amountMinor, currency } = input;
	if (original.type !== "EXPENSE") return "Only an expense can be refunded";
	if (currency !== original.currency) {
		return `A refund must be in the same currency as the expense (${original.currency})`;
	}
	const remaining = refundableRemaining(original, alreadyRefundedMinor);
	if (amountMinor > remaining) {
		return remaining === 0
			? "This expense has already been fully refunded"
			: `Refund is more than what is left to refund (${show(remaining, original.currency)})`;
	}
	return null;
}

/**
 * Whether an expense that already has refunds may be edited to the given amount/currency.
 * Returns a user-facing message, or null.
 */
export function validateExpenseEdit(input: {
	currentCurrency: string;
	newCurrency: string;
	newAmountMinor: number;
	refundedMinor: number;
}): string | null {
	if (input.refundedMinor === 0) return null;
	if (input.newCurrency !== input.currentCurrency) {
		return "The currency cannot change while the expense has refunds";
	}
	if (input.newAmountMinor < input.refundedMinor) {
		return `The amount cannot be less than what was already refunded (${show(input.refundedMinor, input.currentCurrency)})`;
	}
	return null;
}

export type TotalsRow = {
	currency: string;
	type: TransactionType;
	sumMinor: number;
};

export type CurrencyTotals = {
	currency: string;
	spentMinor: number;
	refundedMinor: number;
	/** spent minus refunded */
	netMinor: number;
};

/** Spent, refunded and net per currency. Currencies are never combined. */
export function netByCurrency(rows: readonly TotalsRow[]): CurrencyTotals[] {
	const byCurrency = new Map<string, { spent: number; refunded: number }>();
	for (const row of rows) {
		const entry = byCurrency.get(row.currency) ?? { spent: 0, refunded: 0 };
		if (row.type === "EXPENSE") entry.spent += row.sumMinor;
		else entry.refunded += row.sumMinor;
		byCurrency.set(row.currency, entry);
	}
	return [...byCurrency.entries()]
		.map(([currency, { spent, refunded }]) => ({
			currency,
			spentMinor: spent,
			refundedMinor: refunded,
			netMinor: spent - refunded,
		}))
		.sort((a, b) => a.currency.localeCompare(b.currency));
}

/** Positive for spending, negative for refunds; for display and sorting only. */
export function signedAmount(type: TransactionType, amountMinor: number) {
	return type === "REFUND" ? -amountMinor : amountMinor;
}

/**
 * The currency a new expense should show after the card field changed. It follows the card's
 * currency only until the user has chosen one themselves; an explicit choice is never
 * overwritten, and forms that do not follow the card (edits, refunds) are left alone.
 */
export function currencyAfterCardChange(input: {
	followCard: boolean;
	chosenByUser: boolean;
	cardCurrency: string | null;
	current: string;
}): string {
	if (!input.followCard || input.chosenByUser || !input.cardCurrency) {
		return input.current;
	}
	return input.cardCurrency;
}
