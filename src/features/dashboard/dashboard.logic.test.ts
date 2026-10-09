import { describe, expect, it } from "vitest";

import { todayIn } from "#/lib/calendar-date";

import {
	barPercent,
	type CategoryGroup,
	describeUpcoming,
	formatMonthLabel,
	isValidMonth,
	monthBounds,
	monthOf,
	shiftMonth,
	spendingByCategory,
	type UpcomingEvent,
	type UpcomingSubscription,
	upcomingEvents,
} from "./dashboard.logic";

describe("months", () => {
	it("validates YYYY-MM", () => {
		for (const ok of ["2026-01", "2026-12", "1900-06"])
			expect(isValidMonth(ok)).toBe(true);
		for (const bad of [
			"2026-13",
			"2026-00",
			"2026-1",
			"26-01",
			"2026-01-01",
			"",
			"abcd-ef",
			"1800-01",
		]) {
			expect(isValidMonth(bad)).toBe(false);
		}
	});
	it("gives first and last day, including leap years", () => {
		expect(monthBounds("2025-02")).toEqual({
			start: "2025-02-01",
			end: "2025-02-28",
		});
		expect(monthBounds("2024-02")).toEqual({
			start: "2024-02-01",
			end: "2024-02-29",
		});
		expect(monthBounds("2025-12")).toEqual({
			start: "2025-12-01",
			end: "2025-12-31",
		});
		expect(monthBounds("2025-04")).toEqual({
			start: "2025-04-01",
			end: "2025-04-30",
		});
		expect(() => monthBounds("2025-13")).toThrow();
	});
	it("shifts across year boundaries", () => {
		expect(shiftMonth("2025-01", -1)).toBe("2024-12");
		expect(shiftMonth("2025-12", 1)).toBe("2026-01");
		expect(shiftMonth("2025-03", -14)).toBe("2024-01");
		expect(shiftMonth("2025-03", 0)).toBe("2025-03");
	});
	it("labels months without timezone drift", () => {
		expect(formatMonthLabel("2026-10")).toBe("October 2026");
		expect(formatMonthLabel("2025-01")).toBe("January 2025");
		expect(formatMonthLabel("2025-12")).toBe("December 2025");
	});
	it("follows the user's time zone for the current month", () => {
		const instant = new Date("2025-02-28T20:00:00Z"); // already March 1 in Kathmandu (UTC+5:45)
		expect(monthOf(todayIn("UTC", instant))).toBe("2025-02");
		expect(monthOf(todayIn("Asia/Kathmandu", instant))).toBe("2025-03");
	});
});

describe("spendingByCategory", () => {
	const names = new Map([
		["food", "Food"],
		["fun", "Fun"],
		["old", "Archived thing"],
	]);
	const g = (
		categoryId: string | null,
		currency: string,
		type: "EXPENSE" | "REFUND",
		sumMinor: number,
	): CategoryGroup => ({ categoryId, currency, type, sumMinor });

	it("nets refunds per category and sorts largest first", () => {
		const [npr] = spendingByCategory(
			[
				g("food", "NPR", "EXPENSE", 500_000),
				g("food", "NPR", "REFUND", 100_000),
				g("fun", "NPR", "EXPENSE", 900_000),
				g(null, "NPR", "EXPENSE", 50_000),
			],
			names,
		);
		expect(npr?.rows.map((r) => [r.name, r.netMinor])).toEqual([
			["Fun", 900_000],
			["Food", 400_000],
			["Uncategorized", 50_000],
		]);
		expect(npr?.rows[1]).toMatchObject({
			spentMinor: 500_000,
			refundedMinor: 100_000,
			netMinor: 400_000,
		});
		expect(npr).toMatchObject({ netMinor: 1_350_000, maxNetMinor: 900_000 });
	});

	it("keeps currencies completely separate", () => {
		const result = spendingByCategory(
			[
				g("food", "NPR", "EXPENSE", 100_000),
				g("food", "USD", "EXPENSE", 2_500),
				g("fun", "USD", "EXPENSE", 900),
			],
			names,
		);
		expect(result.map((r) => r.currency)).toEqual(["NPR", "USD"]);
		expect(result[0]).toMatchObject({ netMinor: 100_000 });
		expect(result[1]).toMatchObject({ netMinor: 3_400 });
		expect(result[1]?.rows.map((r) => r.name)).toEqual(["Food", "Fun"]);
	});

	it("shows a category that refunds exceeded as negative and never scales bars from it", () => {
		const [npr] = spendingByCategory(
			[g("food", "NPR", "REFUND", 30_000), g("fun", "NPR", "EXPENSE", 10_000)],
			names,
		);
		expect(npr?.rows.map((r) => r.netMinor)).toEqual([10_000, -30_000]);
		expect(npr?.maxNetMinor).toBe(10_000);
		const [onlyRefund] = spendingByCategory(
			[g("food", "NPR", "REFUND", 30_000)],
			names,
		);
		expect(onlyRefund?.maxNetMinor).toBe(0);
	});

	it("keeps archived category names and tolerates unknown ids", () => {
		const [npr] = spendingByCategory(
			[g("old", "NPR", "EXPENSE", 1_000), g("ghost", "NPR", "EXPENSE", 500)],
			names,
		);
		expect(npr?.rows.map((r) => r.name)).toEqual([
			"Archived thing",
			"Unknown category",
		]);
	});

	it("returns nothing for no data", () => {
		expect(spendingByCategory([], names)).toEqual([]);
	});
});

describe("upcomingEvents", () => {
	const today = "2025-03-10";
	const sub = (
		over: Partial<UpcomingSubscription> = {},
	): UpcomingSubscription => ({
		id: "sub-1",
		name: "Streaming",
		amountMinor: 64_900,
		currency: "NPR",
		anchorDate: "2025-01-15",
		intervalCount: 1,
		intervalUnit: "MONTH",
		status: "ACTIVE",
		autoRenew: true,
		expiresOn: null,
		cancellationDeadline: null,
		...over,
	});
	const statement = {
		id: "st-1",
		cardName: "Daily",
		last4: "0000",
		dueDate: "2025-03-20",
		outstandingMinor: 500_000,
		currency: "NPR",
	};
	const card = {
		id: "card-1",
		name: "Daily",
		last4: "0000",
		paymentDueDay: 25,
		hasStatements: false,
	};
	const run = (over: object = {}) =>
		upcomingEvents({
			today,
			subscriptions: [],
			statements: [],
			cards: [],
			...over,
		});

	it("lists renewals within 30 days, including the last day and excluding the next", () => {
		// Renews on the 15th: 5 days away.
		expect(run({ subscriptions: [sub()] })).toMatchObject([
			{ kind: "RENEWAL", date: "2025-03-15", daysUntil: 5 },
		]);
		// Renews exactly 30 days out (2025-04-09) is included; 31 days out is not.
		expect(
			run({ subscriptions: [sub({ anchorDate: "2025-01-09" })] }),
		).toHaveLength(1);
		expect(
			run({ subscriptions: [sub({ anchorDate: "2025-01-10" })] })[0]?.date,
		).toBe("2025-03-10");
		expect(
			upcomingEvents({
				today: "2025-03-11",
				subscriptions: [sub({ anchorDate: "2025-01-10" })],
				statements: [],
				cards: [],
			}),
		).toHaveLength(1);
		expect(
			upcomingEvents({
				today: "2025-03-10",
				horizonDays: 4,
				subscriptions: [sub()],
				statements: [],
				cards: [],
			}),
		).toEqual([]);
	});

	it("includes expiry and cancel-by dates, and expiry for subscriptions that no longer renew", () => {
		const events = run({
			subscriptions: [
				sub({
					autoRenew: false,
					expiresOn: "2025-03-18",
					cancellationDeadline: "2025-03-12",
				}),
			],
		});
		expect(events.map((e) => [e.kind, e.date])).toEqual([
			["CANCEL_BY", "2025-03-12"],
			["EXPIRY", "2025-03-18"],
		]);
	});

	it("ignores cancelled subscriptions entirely", () => {
		expect(
			run({
				subscriptions: [
					sub({
						status: "CANCELLED",
						expiresOn: "2025-03-18",
						cancellationDeadline: "2025-03-12",
					}),
				],
			}),
		).toEqual([]);
	});

	it("reports statements by real due date, with the amount, and overdue ones first regardless of the horizon", () => {
		const overdue = {
			...statement,
			id: "st-old",
			dueDate: "2024-12-01",
			cardName: "Old card",
		};
		const events = run({
			subscriptions: [sub()],
			statements: [statement, overdue],
			cards: [{ ...card, hasStatements: true }],
		});
		expect(events.map((e) => [e.kind, e.label, e.daysUntil])).toEqual([
			["STATEMENT_OVERDUE", "Old card", -99],
			["RENEWAL", "Streaming", 5],
			["STATEMENT_DUE", "Daily", 10],
		]);
		expect(events[2]).toMatchObject({
			amountMinor: 500_000,
			currency: "NPR",
			target: { type: "statement", id: "st-1" },
		});
	});

	it("falls back to the card's due day only for cards without statements", () => {
		expect(run({ cards: [card] })).toMatchObject([
			{
				kind: "CARD_DUE_DAY",
				date: "2025-03-25",
				target: { type: "card", id: "card-1" },
			},
		]);
		expect(run({ cards: [{ ...card, hasStatements: true }] })).toEqual([]);
	});

	it("orders overdue most-overdue first, then by date and kind", () => {
		const events = run({
			subscriptions: [
				sub({ id: "a", name: "Zeta", anchorDate: "2025-01-12" }),
				sub({ id: "b", name: "Alpha", anchorDate: "2025-01-12" }),
			],
			statements: [
				{ ...statement, dueDate: "2025-03-12", id: "s-due" },
				{ ...statement, id: "s-over-1", dueDate: "2025-03-01" },
				{ ...statement, id: "s-over-2", dueDate: "2025-02-15" },
			],
		});
		expect(events.map((e) => `${e.kind}:${e.target.id}`)).toEqual([
			"STATEMENT_OVERDUE:s-over-2",
			"STATEMENT_OVERDUE:s-over-1",
			"STATEMENT_DUE:s-due",
			"RENEWAL:b",
			"RENEWAL:a",
		]);
	});

	it("is empty when nothing is upcoming", () => {
		expect(run()).toEqual([]);
		expect(
			run({ statements: [{ ...statement, outstandingMinor: 0 }] }),
		).toEqual([]);
	});
});

describe("describeUpcoming", () => {
	const base = {
		date: "2025-03-15",
		label: "Streaming",
		target: { type: "subscription", id: "s" },
	} as const;
	const ev = (over: Partial<UpcomingEvent>): UpcomingEvent => ({
		kind: "RENEWAL",
		daysUntil: 5,
		...base,
		...over,
	});

	it("words subscription events", () => {
		expect(describeUpcoming(ev({ kind: "RENEWAL", daysUntil: 0 })).text).toBe(
			"Streaming renews today",
		);
		expect(describeUpcoming(ev({ kind: "RENEWAL", daysUntil: 1 })).text).toBe(
			"Streaming renews tomorrow",
		);
		expect(describeUpcoming(ev({ kind: "EXPIRY", daysUntil: 9 })).text).toBe(
			"Streaming expires in 9 days",
		);
		expect(describeUpcoming(ev({ kind: "CANCEL_BY", daysUntil: 2 })).text).toBe(
			"Cancel Streaming by 2025-03-15 (in 2 days)",
		);
	});
	it("words card payments, marking overdue ones as danger", () => {
		const card = {
			label: "Daily",
			last4: "0000",
			target: { type: "statement", id: "st" },
		} as const;
		expect(
			describeUpcoming(
				ev({ ...card, kind: "STATEMENT_OVERDUE", daysUntil: -1 }),
			),
		).toEqual({
			text: "Daily •••• 0000: payment overdue by 1 day",
			tone: "danger",
		});
		expect(
			describeUpcoming(
				ev({ ...card, kind: "STATEMENT_OVERDUE", daysUntil: -19 }),
			).text,
		).toBe("Daily •••• 0000: payment overdue by 19 days");
		expect(
			describeUpcoming(ev({ ...card, kind: "STATEMENT_DUE", daysUntil: 11 })),
		).toEqual({
			text: "Daily •••• 0000: payment due in 11 days",
			tone: "neutral",
		});
		expect(
			describeUpcoming(ev({ ...card, kind: "CARD_DUE_DAY", daysUntil: 1 }))
				.text,
		).toBe("Daily •••• 0000: payment due tomorrow (monthly due day)");
	});
});

describe("barPercent", () => {
	it("scales to the largest positive amount", () => {
		expect(barPercent(900, 900)).toBe(100);
		expect(barPercent(450, 900)).toBe(50);
		expect(barPercent(1, 100_000)).toBe(2);
	});
	it("draws nothing for zero, negative or when nothing is positive", () => {
		expect(barPercent(0, 900)).toBe(0);
		expect(barPercent(-300, 900)).toBe(0);
		expect(barPercent(500, 0)).toBe(0);
	});
});
