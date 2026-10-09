import { describe, expect, it } from "vitest";

import {
	cardPaymentDueEvents,
	outstandingByCurrency,
	outstandingMinor,
	overpaidMinor,
	periodsOverlap,
	statementStatus,
	statusLabel,
	suggestNextStatement,
} from "./statements.logic";

describe("outstanding and overpaid", () => {
	it.each([
		[100_000, 0, 100_000, 0],
		[100_000, 40_000, 60_000, 0],
		[100_000, 100_000, 0, 0],
		[100_000, 130_000, 0, 30_000],
		[0, 0, 0, 0],
		[0, 5_000, 0, 5_000],
	])("balance %i paid %i", (balance, paid, outstanding, over) => {
		expect(outstandingMinor(balance, paid)).toBe(outstanding);
		expect(overpaidMinor(balance, paid)).toBe(over);
	});
});

describe("statementStatus", () => {
	const base = { balanceMinor: 100_000, paidMinor: 0, dueDate: "2025-03-20" };

	it("is open until the due date, including the due date itself", () => {
		expect(statementStatus({ ...base, today: "2025-03-10" })).toMatchObject({
			status: "OPEN",
			daysUntilDue: 10,
		});
		expect(statementStatus({ ...base, today: "2025-03-20" })).toMatchObject({
			status: "OPEN",
			daysUntilDue: 0,
		});
	});
	it("is overdue the day after, with negative days", () => {
		expect(statementStatus({ ...base, today: "2025-03-21" })).toMatchObject({
			status: "OVERDUE",
			daysUntilDue: -1,
		});
		expect(statementStatus({ ...base, today: "2025-04-20" })).toMatchObject({
			status: "OVERDUE",
			daysUntilDue: -31,
		});
	});
	it("is paid once nothing is outstanding, never overdue", () => {
		expect(
			statementStatus({ ...base, paidMinor: 100_000, today: "2025-05-01" }),
		).toMatchObject({ status: "PAID", outstandingMinor: 0 });
		expect(
			statementStatus({ ...base, balanceMinor: 0, today: "2025-05-01" }).status,
		).toBe("PAID");
	});
	it("keeps a partly paid statement open and reports the remainder", () => {
		expect(
			statementStatus({ ...base, paidMinor: 30_000, today: "2025-03-10" }),
		).toMatchObject({
			status: "OPEN",
			outstandingMinor: 70_000,
			overpaidMinor: 0,
		});
	});
	it("reports an overpayment as credit", () => {
		expect(
			statementStatus({ ...base, paidMinor: 120_000, today: "2025-03-10" }),
		).toMatchObject({
			status: "PAID",
			outstandingMinor: 0,
			overpaidMinor: 20_000,
		});
	});
});

describe("periodsOverlap", () => {
	const march = { start: "2025-03-01", end: "2025-03-31" };
	it("detects overlap, including a single shared day", () => {
		expect(
			periodsOverlap(march, { start: "2025-03-15", end: "2025-04-14" }),
		).toBe(true);
		expect(
			periodsOverlap(march, { start: "2025-03-31", end: "2025-04-30" }),
		).toBe(true);
		expect(
			periodsOverlap(march, { start: "2025-02-01", end: "2025-03-01" }),
		).toBe(true);
		expect(
			periodsOverlap(march, { start: "2025-03-10", end: "2025-03-12" }),
		).toBe(true);
	});
	it("allows back-to-back periods", () => {
		expect(
			periodsOverlap(march, { start: "2025-04-01", end: "2025-04-30" }),
		).toBe(false);
		expect(
			periodsOverlap(march, { start: "2025-02-01", end: "2025-02-28" }),
		).toBe(false);
	});
});

describe("suggestNextStatement", () => {
	const card = { statementDay: 5, paymentDueDay: 20 };

	it("uses the latest statement day and the following due day when nothing is recorded", () => {
		expect(
			suggestNextStatement({
				card,
				previousPeriodEnd: null,
				today: "2025-03-12",
			}),
		).toEqual({
			periodStart: "2025-02-06",
			periodEnd: "2025-03-05",
			dueDate: "2025-03-20",
		});
	});
	it("uses last month's statement day before this month's has arrived", () => {
		expect(
			suggestNextStatement({
				card,
				previousPeriodEnd: null,
				today: "2025-03-04",
			}),
		).toEqual({
			periodStart: "2025-01-06",
			periodEnd: "2025-02-05",
			dueDate: "2025-02-20",
		});
	});
	it("puts the due date in the next month when the due day is before the statement day", () => {
		expect(
			suggestNextStatement({
				card: { statementDay: 25, paymentDueDay: 10 },
				previousPeriodEnd: null,
				today: "2025-03-28",
			}),
		).toEqual({
			periodStart: "2025-02-26",
			periodEnd: "2025-03-25",
			dueDate: "2025-04-10",
		});
	});
	it("continues from the previous statement without gaps or overlap", () => {
		expect(
			suggestNextStatement({
				card,
				previousPeriodEnd: "2025-02-05",
				today: "2025-03-12",
			}),
		).toEqual({
			periodStart: "2025-02-06",
			periodEnd: "2025-03-05",
			dueDate: "2025-03-20",
		});
	});
	it("moves on to the next period when the latest one is already recorded", () => {
		expect(
			suggestNextStatement({
				card,
				previousPeriodEnd: "2025-03-05",
				today: "2025-03-12",
			}),
		).toEqual({
			periodStart: "2025-03-06",
			periodEnd: "2025-04-05",
			dueDate: "2025-04-20",
		});
	});
	it("handles month-end statement days", () => {
		expect(
			suggestNextStatement({
				card: { statementDay: 31, paymentDueDay: 15 },
				previousPeriodEnd: null,
				today: "2025-03-10",
			}),
		).toEqual({
			periodStart: "2025-02-01",
			periodEnd: "2025-02-28",
			dueDate: "2025-03-15",
		});
	});
	it("returns null without a statement day and no due date without a due day", () => {
		expect(
			suggestNextStatement({
				card: { statementDay: null, paymentDueDay: 20 },
				previousPeriodEnd: null,
				today: "2025-03-12",
			}),
		).toBeNull();
		expect(
			suggestNextStatement({
				card: { statementDay: 5, paymentDueDay: null },
				previousPeriodEnd: null,
				today: "2025-03-12",
			})?.dueDate,
		).toBeNull();
	});
});

describe("outstandingByCurrency", () => {
	it("sums per currency and drops settled ones", () => {
		expect(
			outstandingByCurrency([
				{ currency: "NPR", outstandingMinor: 100_000 },
				{ currency: "NPR", outstandingMinor: 50_000 },
				{ currency: "USD", outstandingMinor: 2_500 },
				{ currency: "EUR", outstandingMinor: 0 },
			]),
		).toEqual([
			{ currency: "NPR", outstandingMinor: 150_000 },
			{ currency: "USD", outstandingMinor: 2_500 },
		]);
		expect(outstandingByCurrency([])).toEqual([]);
	});
});

describe("statusLabel", () => {
	it("words each state", () => {
		expect(
			statusLabel({ status: "OVERDUE", daysUntilDue: -1, paidMinor: 0 }),
		).toEqual({ label: "Overdue by 1 day", tone: "danger" });
		expect(
			statusLabel({ status: "OVERDUE", daysUntilDue: -12, paidMinor: 0 }).label,
		).toBe("Overdue by 12 days");
		expect(
			statusLabel({ status: "OPEN", daysUntilDue: 0, paidMinor: 0 }).label,
		).toBe("Due today");
		expect(
			statusLabel({ status: "OPEN", daysUntilDue: 1, paidMinor: 0 }).label,
		).toBe("Due tomorrow");
		expect(
			statusLabel({ status: "OPEN", daysUntilDue: 9, paidMinor: 0 }).label,
		).toBe("Due in 9 days");
		expect(
			statusLabel({ status: "OPEN", daysUntilDue: 9, paidMinor: 500 }).label,
		).toBe("Partly paid · due in 9 days");
		expect(
			statusLabel({ status: "PAID", daysUntilDue: -40, paidMinor: 500 }),
		).toEqual({ label: "Paid", tone: "success" });
	});
});

describe("cardPaymentDueEvents", () => {
	const card = {
		id: "card-1",
		name: "Daily",
		last4: "0000",
		paymentDueDay: 20,
		hasStatements: false,
	};
	const statement = {
		id: "st-1",
		cardName: "Daily",
		last4: "0000",
		dueDate: "2025-03-20",
		outstandingMinor: 500_000,
		currency: "NPR",
	};

	it("reports an unpaid statement on its real due date with the amount owed", () => {
		expect(
			cardPaymentDueEvents({
				today: "2025-03-10",
				cards: [{ ...card, hasStatements: true }],
				statements: [statement],
			}),
		).toEqual([
			{
				source: "STATEMENT",
				entityId: "st-1",
				cardName: "Daily",
				last4: "0000",
				dueDate: "2025-03-20",
				amountMinor: 500_000,
				currency: "NPR",
			},
		]);
	});
	it("includes overdue statements with their past date", () => {
		const [event] = cardPaymentDueEvents({
			today: "2025-04-01",
			cards: [],
			statements: [statement],
		});
		expect(event?.dueDate).toBe("2025-03-20");
	});
	it("ignores statements with nothing left to pay", () => {
		expect(
			cardPaymentDueEvents({
				today: "2025-03-10",
				cards: [],
				statements: [{ ...statement, outstandingMinor: 0 }],
			}),
		).toEqual([]);
	});
	it("falls back to the card's due day only when it has no statements", () => {
		expect(
			cardPaymentDueEvents({
				today: "2025-03-10",
				cards: [card],
				statements: [],
			}),
		).toEqual([
			{
				source: "CARD_DAY",
				entityId: "card-1",
				cardName: "Daily",
				last4: "0000",
				dueDate: "2025-03-20",
			},
		]);
		expect(
			cardPaymentDueEvents({
				today: "2025-03-10",
				cards: [{ ...card, hasStatements: true }],
				statements: [],
			}),
		).toEqual([]);
		expect(
			cardPaymentDueEvents({
				today: "2025-03-10",
				cards: [{ ...card, paymentDueDay: null }],
				statements: [],
			}),
		).toEqual([]);
	});
	it("rolls the fallback to next month once this month's day has passed", () => {
		expect(
			cardPaymentDueEvents({
				today: "2025-03-21",
				cards: [card],
				statements: [],
			})[0]?.dueDate,
		).toBe("2025-04-20");
	});
});
