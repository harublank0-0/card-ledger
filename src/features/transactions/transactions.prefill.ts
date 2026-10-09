import {
	SUBSCRIPTIONS_CATEGORY_NAME,
	sameCategoryName,
} from "#/features/categories/categories.logic";
import type { CalendarDate } from "#/lib/calendar-date";
import { type CurrencyCode, minorToInputString } from "#/lib/money";

import type { TransactionFormValues } from "./transactions.schemas";

type Pickable = { id: string; name: string };

/**
 * Starting values for the new-transaction form. Only active categories/cards are ever
 * prefilled, because the server refuses new links to archived ones.
 */
export function buildNewTransactionValues(input: {
	today: CalendarDate;
	categories: Pickable[];
	cards: Pickable[];
	/** "Record charge" from a subscription. */
	subscription?: {
		id: string;
		name: string;
		amountMinor: number;
		currency: string;
		paymentMethodId: string | null;
	} | null;
	/** "Record refund" from an expense. */
	original?: {
		id: string;
		description: string;
		currency: string;
		categoryId: string | null;
		paymentMethodId: string | null;
		refundableMinor: number;
	} | null;
}): TransactionFormValues {
	const activeCard = (id: string | null) =>
		id && input.cards.some((c) => c.id === id) ? id : "";
	const activeCategory = (id: string | null) =>
		id && input.categories.some((c) => c.id === id) ? id : "";

	const blank: TransactionFormValues = {
		description: "",
		amount: "",
		currency: "NPR",
		occurredOn: input.today,
		categoryId: "",
		paymentMethodId: "",
		subscriptionId: "",
		refundOfId: "",
		notes: "",
	};

	if (input.original) {
		const o = input.original;
		return {
			...blank,
			description: `Refund: ${o.description}`.slice(0, 120),
			amount: minorToInputString(o.refundableMinor, o.currency as CurrencyCode),
			currency: o.currency as CurrencyCode,
			categoryId: activeCategory(o.categoryId),
			paymentMethodId: activeCard(o.paymentMethodId),
			refundOfId: o.id,
		};
	}

	if (input.subscription) {
		const s = input.subscription;
		const subscriptionsCategory = input.categories.find((c) =>
			sameCategoryName(c.name, SUBSCRIPTIONS_CATEGORY_NAME),
		);
		return {
			...blank,
			description: s.name,
			amount: minorToInputString(s.amountMinor, s.currency as CurrencyCode),
			currency: s.currency as CurrencyCode,
			// The charge being recorded has already happened, so it defaults to today
			// rather than the (future) next renewal date.
			paymentMethodId: activeCard(s.paymentMethodId),
			categoryId: subscriptionsCategory?.id ?? "",
			subscriptionId: s.id,
		};
	}

	return blank;
}
