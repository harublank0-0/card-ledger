import { describe, expect, it } from "vitest";

import { buildNewTransactionValues } from "./transactions.prefill";

const categories = [
	{ id: "c-sub", name: "subscriptions" },
	{ id: "c-food", name: "Food" },
];
const cards = [{ id: "card-1", name: "Daily" }];
const base = { today: "2025-03-10", categories, cards };

describe("buildNewTransactionValues", () => {
	it("starts blank, dated today", () => {
		expect(buildNewTransactionValues(base)).toMatchObject({
			description: "",
			amount: "",
			occurredOn: "2025-03-10",
			refundOfId: "",
			subscriptionId: "",
		});
	});

	it("prefills a subscription charge and links it", () => {
		const v = buildNewTransactionValues({
			...base,
			subscription: {
				id: "sub-1",
				name: "Streaming",
				amountMinor: 64_900,
				currency: "NPR",
				paymentMethodId: "card-1",
			},
		});
		expect(v).toMatchObject({
			description: "Streaming",
			amount: "649.00",
			currency: "NPR",
			paymentMethodId: "card-1",
			categoryId: "c-sub",
			subscriptionId: "sub-1",
			occurredOn: "2025-03-10",
		});
	});

	it("does not prefill an archived card or a missing Subscriptions category", () => {
		const v = buildNewTransactionValues({
			today: "2025-03-10",
			cards: [],
			categories: [{ id: "c-food", name: "Food" }],
			subscription: {
				id: "sub-1",
				name: "Streaming",
				amountMinor: 100,
				currency: "USD",
				paymentMethodId: "card-archived",
			},
		});
		expect(v).toMatchObject({
			paymentMethodId: "",
			categoryId: "",
			currency: "USD",
			amount: "1.00",
		});
	});

	it("prefills a refund for what is still refundable, keeping the expense's currency", () => {
		const v = buildNewTransactionValues({
			...base,
			original: {
				id: "exp-1",
				description: "Headphones",
				currency: "USD",
				categoryId: "c-food",
				paymentMethodId: "card-1",
				refundableMinor: 4_050,
			},
		});
		expect(v).toMatchObject({
			description: "Refund: Headphones",
			amount: "40.50",
			currency: "USD",
			categoryId: "c-food",
			paymentMethodId: "card-1",
			refundOfId: "exp-1",
			subscriptionId: "",
		});
	});

	it("keeps the refund description within the limit", () => {
		const v = buildNewTransactionValues({
			...base,
			original: {
				id: "e",
				description: "x".repeat(120),
				currency: "NPR",
				categoryId: null,
				paymentMethodId: null,
				refundableMinor: 100,
			},
		});
		expect(v.description.length).toBe(120);
	});
});
