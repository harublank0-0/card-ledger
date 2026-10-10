import { describe, expect, it } from "vitest";

import {
	currencyAfterCardChange,
	dateFilterEntry,
	netByCurrency,
	refundableRemaining,
	signedAmount,
	validateExpenseEdit,
	validateRefund,
} from "./transactions.logic";

const expense = {
	type: "EXPENSE",
	amountMinor: 100_000,
	currency: "NPR",
} as const;

describe("validateRefund", () => {
	it("accepts a refund up to the remaining amount", () => {
		expect(
			validateRefund({
				original: expense,
				alreadyRefundedMinor: 0,
				amountMinor: 100_000,
				currency: "NPR",
			}),
		).toBeNull();
		expect(
			validateRefund({
				original: expense,
				alreadyRefundedMinor: 60_000,
				amountMinor: 40_000,
				currency: "NPR",
			}),
		).toBeNull();
		expect(
			validateRefund({
				original: expense,
				alreadyRefundedMinor: 0,
				amountMinor: 1,
				currency: "NPR",
			}),
		).toBeNull();
	});

	it("rejects more than what is left, naming the remaining amount", () => {
		expect(
			validateRefund({
				original: expense,
				alreadyRefundedMinor: 0,
				amountMinor: 100_001,
				currency: "NPR",
			}),
		).toMatch(/NPR 1,000\.00/);
		expect(
			validateRefund({
				original: expense,
				alreadyRefundedMinor: 60_000,
				amountMinor: 40_001,
				currency: "NPR",
			}),
		).toMatch(/NPR 400\.00/);
	});

	it("rejects any refund once fully refunded", () => {
		expect(
			validateRefund({
				original: expense,
				alreadyRefundedMinor: 100_000,
				amountMinor: 1,
				currency: "NPR",
			}),
		).toBe("This expense has already been fully refunded");
	});

	it("rejects a different currency", () => {
		expect(
			validateRefund({
				original: expense,
				alreadyRefundedMinor: 0,
				amountMinor: 100,
				currency: "USD",
			}),
		).toMatch(/same currency.*NPR/);
	});

	it("rejects refunding a refund", () => {
		expect(
			validateRefund({
				original: { ...expense, type: "REFUND" },
				alreadyRefundedMinor: 0,
				amountMinor: 100,
				currency: "NPR",
			}),
		).toBe("Only an expense can be refunded");
	});
});

describe("refundableRemaining", () => {
	it("never goes negative", () => {
		expect(refundableRemaining(expense, 30_000)).toBe(70_000);
		expect(refundableRemaining(expense, 100_000)).toBe(0);
		expect(refundableRemaining(expense, 150_000)).toBe(0);
	});
});

describe("validateExpenseEdit", () => {
	const base = {
		currentCurrency: "NPR",
		newCurrency: "NPR",
		newAmountMinor: 100_000,
		refundedMinor: 0,
	};
	it("allows anything while there are no refunds", () => {
		expect(
			validateExpenseEdit({ ...base, newCurrency: "USD", newAmountMinor: 5 }),
		).toBeNull();
	});
	it("keeps the currency and a sufficient amount once refunded", () => {
		const refunded = { ...base, refundedMinor: 40_000 };
		expect(
			validateExpenseEdit({ ...refunded, newAmountMinor: 40_000 }),
		).toBeNull();
		expect(
			validateExpenseEdit({ ...refunded, newAmountMinor: 39_999 }),
		).toMatch(/NPR 400\.00/);
		expect(validateExpenseEdit({ ...refunded, newCurrency: "USD" })).toMatch(
			/currency/,
		);
	});
});

describe("netByCurrency", () => {
	it("nets refunds against spending per currency and never mixes currencies", () => {
		const totals = netByCurrency([
			{ currency: "NPR", type: "EXPENSE", sumMinor: 500_000 },
			{ currency: "NPR", type: "REFUND", sumMinor: 120_000 },
			{ currency: "USD", type: "EXPENSE", sumMinor: 9_900 },
		]);
		expect(totals).toEqual([
			{
				currency: "NPR",
				spentMinor: 500_000,
				refundedMinor: 120_000,
				netMinor: 380_000,
			},
			{ currency: "USD", spentMinor: 9_900, refundedMinor: 0, netMinor: 9_900 },
		]);
	});
	it("handles a refunds-only filter and an empty set", () => {
		expect(
			netByCurrency([{ currency: "NPR", type: "REFUND", sumMinor: 5_000 }]),
		).toEqual([
			{
				currency: "NPR",
				spentMinor: 0,
				refundedMinor: 5_000,
				netMinor: -5_000,
			},
		]);
		expect(netByCurrency([])).toEqual([]);
	});
});

describe("signedAmount", () => {
	it("makes refunds negative", () => {
		expect(signedAmount("EXPENSE", 500)).toBe(500);
		expect(signedAmount("REFUND", 500)).toBe(-500);
	});
});

// A new expense follows the chosen card's currency "until edited". Without remembering the
// edit, picking a card after choosing a currency silently replaced it: 15.49 USD became
// 15.49 NPR on save, and the currency field sits above the card field so it is easy to miss.
describe("currencyAfterCardChange", () => {
	const base = {
		followCard: true,
		chosenByUser: false,
		cardCurrency: "NPR",
		current: "USD",
	};

	it("follows the card's currency while the user has not chosen one", () => {
		expect(currencyAfterCardChange(base)).toBe("NPR");
	});

	it("keeps a currency the user chose, whatever card is picked afterwards", () => {
		expect(currencyAfterCardChange({ ...base, chosenByUser: true })).toBe(
			"USD",
		);
	});

	it("does nothing for forms that do not follow the card (edits, refunds)", () => {
		expect(currencyAfterCardChange({ ...base, followCard: false })).toBe("USD");
	});

	it("keeps the current currency when no card is chosen", () => {
		expect(currencyAfterCardChange({ ...base, cardCurrency: null })).toBe(
			"USD",
		);
	});
});

describe("dateFilterEntry", () => {
	// A native date input reports a full yyyy-mm-dd string while the year is still being typed:
	// "0002-01-01", "0020-01-01", "0202-01-01", then "2026-01-01". Acting on the early ones
	// would put a meaningless filter in the URL and, because the page then renders "no filter",
	// wipe the field under the person's fingers.
	it("waits while the year is still being typed", () => {
		for (const partial of ["0002-01-01", "0020-01-01", "0202-01-01"]) {
			expect(dateFilterEntry(partial)).toEqual({ action: "wait" });
		}
	});

	it("applies a complete valid date", () => {
		expect(dateFilterEntry("2026-01-31")).toEqual({
			action: "set",
			value: "2026-01-31",
		});
	});

	it("clears the filter when the field is emptied", () => {
		expect(dateFilterEntry("")).toEqual({ action: "set", value: undefined });
	});

	it("waits on impossible or malformed entries", () => {
		for (const bad of [
			"2026-02-30",
			"2026-13-01",
			"1899-12-31",
			"abc",
			"2026-1-1",
		]) {
			expect(dateFilterEntry(bad)).toEqual({ action: "wait" });
		}
	});
});
