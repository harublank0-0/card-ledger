import { describe, expect, it } from "vitest";

import { describeAccountContents } from "./delete-account";

const base = {
	cards: 0,
	subscriptions: 0,
	transactions: 0,
	statements: 0,
	statementPayments: 0,
	categories: 0,
};

describe("describeAccountContents", () => {
	it("lists what exists with correct plurals, skipping zeros", () => {
		expect(
			describeAccountContents({
				...base,
				transactions: 12,
				cards: 1,
				categories: 11,
				statements: 2,
				statementPayments: 1,
				subscriptions: 3,
			}),
		).toBe(
			"12 transactions, 2 statements, 1 statement payment, 3 subscriptions, 1 card, 11 categories",
		);
		expect(describeAccountContents({ ...base, transactions: 1 })).toBe(
			"1 transaction",
		);
	});
	it("handles an empty account", () => {
		expect(describeAccountContents(base)).toBe("no records yet");
	});
});
