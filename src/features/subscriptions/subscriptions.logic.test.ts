import { describe, expect, it } from "vitest";

import {
	describeInterval,
	monthlyCommitments,
	monthlyEquivalentMinor,
	occurrenceAt,
	subscriptionState,
	upcomingRenewals,
} from "./subscriptions.logic";

const active = { status: "ACTIVE", autoRenew: true } as const;

describe("occurrenceAt", () => {
	it("derives month-end dates from the anchor without drift", () => {
		const r = {
			anchorDate: "2025-01-31",
			intervalCount: 1,
			intervalUnit: "MONTH",
		} as const;
		expect([0, 1, 2, 3, 4].map((n) => occurrenceAt(r, n))).toEqual([
			"2025-01-31",
			"2025-02-28",
			"2025-03-31",
			"2025-04-30",
			"2025-05-31",
		]);
	});

	it("uses Feb 29 in leap years for yearly leap-day anchors", () => {
		const r = {
			anchorDate: "2024-02-29",
			intervalCount: 1,
			intervalUnit: "YEAR",
		} as const;
		expect([0, 1, 2, 3, 4].map((n) => occurrenceAt(r, n))).toEqual([
			"2024-02-29",
			"2025-02-28",
			"2026-02-28",
			"2027-02-28",
			"2028-02-29",
		]);
	});

	it("handles weekly and custom intervals", () => {
		expect(
			occurrenceAt(
				{ anchorDate: "2025-01-01", intervalCount: 2, intervalUnit: "WEEK" },
				3,
			),
		).toBe("2025-02-12");
		expect(
			occurrenceAt(
				{ anchorDate: "2025-01-15", intervalCount: 3, intervalUnit: "MONTH" },
				1,
			),
		).toBe("2025-04-15");
		expect(
			occurrenceAt(
				{ anchorDate: "2025-01-15", intervalCount: 2, intervalUnit: "YEAR" },
				1,
			),
		).toBe("2027-01-15");
	});
});

describe("upcomingRenewals", () => {
	const monthly31 = {
		anchorDate: "2025-01-31",
		intervalCount: 1,
		intervalUnit: "MONTH",
	} as const;

	it("returns the anchor itself when from is on or before it", () => {
		expect(upcomingRenewals(monthly31, active, "2024-12-01", 2)).toEqual([
			"2025-01-31",
			"2025-02-28",
		]);
		expect(upcomingRenewals(monthly31, active, "2025-01-31")).toEqual([
			"2025-01-31",
		]);
	});

	it("finds the next date including clamped month-ends", () => {
		expect(upcomingRenewals(monthly31, active, "2025-02-01", 3)).toEqual([
			"2025-02-28",
			"2025-03-31",
			"2025-04-30",
		]);
		// Today is the clamped renewal day itself: still upcoming (today counts).
		expect(upcomingRenewals(monthly31, active, "2025-02-28")).toEqual([
			"2025-02-28",
		]);
		expect(upcomingRenewals(monthly31, active, "2025-03-01")).toEqual([
			"2025-03-31",
		]);
	});

	it("works far from the anchor", () => {
		const weekly = {
			anchorDate: "2020-01-06",
			intervalCount: 1,
			intervalUnit: "WEEK",
		} as const;
		// Mondays; 2030-01-07 is a Monday.
		expect(upcomingRenewals(weekly, active, "2030-01-01")).toEqual([
			"2030-01-07",
		]);
		const yearly = {
			anchorDate: "2016-02-29",
			intervalCount: 1,
			intervalUnit: "YEAR",
		} as const;
		expect(upcomingRenewals(yearly, active, "2027-03-01")).toEqual([
			"2028-02-29",
		]);
	});

	it("stops after the expiry date (inclusive)", () => {
		const rules = { ...active, expiresOn: "2025-03-31" } as const;
		expect(upcomingRenewals(monthly31, rules, "2025-02-01", 5)).toEqual([
			"2025-02-28",
			"2025-03-31",
		]);
		expect(upcomingRenewals(monthly31, rules, "2025-04-01", 5)).toEqual([]);
	});

	it("produces nothing when cancelled or auto-renew is off", () => {
		expect(
			upcomingRenewals(
				monthly31,
				{ status: "CANCELLED", autoRenew: true },
				"2025-02-01",
			),
		).toEqual([]);
		expect(
			upcomingRenewals(
				monthly31,
				{ status: "ACTIVE", autoRenew: false },
				"2025-02-01",
			),
		).toEqual([]);
	});

	it("stays consistent over ten years", () => {
		const r = {
			anchorDate: "2025-01-31",
			intervalCount: 1,
			intervalUnit: "MONTH",
		} as const;
		const dates = upcomingRenewals(r, active, "2025-01-01", 120);
		expect(dates).toHaveLength(120);
		expect(dates.at(-1)).toBe("2034-12-31");
		for (let i = 0; i < dates.length; i++) {
			expect(dates[i]).toBe(occurrenceAt(r, i));
		}
	});
});

describe("subscriptionState", () => {
	it("derives display state", () => {
		expect(subscriptionState(active, "2025-06-01")).toBe("ACTIVE");
		expect(
			subscriptionState({ ...active, autoRenew: false }, "2025-06-01"),
		).toBe("NOT_RENEWING");
		expect(
			subscriptionState({ ...active, expiresOn: "2025-05-31" }, "2025-06-01"),
		).toBe("EXPIRED");
		expect(
			subscriptionState({ ...active, expiresOn: "2025-06-01" }, "2025-06-01"),
		).toBe("ACTIVE");
		expect(
			subscriptionState({ status: "CANCELLED", autoRenew: true }, "2025-06-01"),
		).toBe("CANCELLED");
		expect(
			subscriptionState(
				{ status: "CANCELLED", autoRenew: true, expiresOn: "2025-06-15" },
				"2025-06-01",
			),
		).toBe("NOT_RENEWING");
	});
});

describe("monthlyEquivalentMinor", () => {
	it("normalises billing cycles to a month", () => {
		expect(monthlyEquivalentMinor(1000, 1, "MONTH")).toBe(1000);
		expect(monthlyEquivalentMinor(3000, 3, "MONTH")).toBe(1000);
		expect(monthlyEquivalentMinor(12000, 1, "YEAR")).toBe(1000);
		expect(monthlyEquivalentMinor(1000, 1, "WEEK")).toBe(4333); // 1000*52/12 = 4333.33
	});
	it("rounds half up", () => {
		expect(monthlyEquivalentMinor(1, 2, "MONTH")).toBe(1); // 0.5 -> 1
		expect(monthlyEquivalentMinor(5, 12, "YEAR")).toBe(0); // 0.0347 -> 0
	});
});

describe("describeInterval", () => {
	it("names common intervals", () => {
		expect(describeInterval(1, "MONTH")).toBe("Monthly");
		expect(describeInterval(3, "MONTH")).toBe("Quarterly");
		expect(describeInterval(1, "YEAR")).toBe("Yearly");
		expect(describeInterval(1, "WEEK")).toBe("Weekly");
		expect(describeInterval(6, "MONTH")).toBe("Every 6 months");
		expect(describeInterval(2, "WEEK")).toBe("Every 2 weeks");
	});
});

describe("monthlyCommitments", () => {
	const sub = (
		state: "ACTIVE" | "NOT_RENEWING" | "CANCELLED" | "EXPIRED" | "ENDS_SOON",
		currency: string,
		monthlyEquivalentMinor: number,
	) => ({ state, currency, monthlyEquivalentMinor });
	it("adds up renewing subscriptions per currency without mixing currencies", () => {
		expect(
			monthlyCommitments([
				sub("ACTIVE", "NPR", 64_900),
				sub("ACTIVE", "NPR", 10_000),
				sub("ACTIVE", "USD", 999),
			]),
		).toEqual([
			{ currency: "NPR", monthlyMinor: 74_900, count: 2 },
			{ currency: "USD", monthlyMinor: 999, count: 1 },
		]);
	});
	it("skips subscriptions that are not renewing", () => {
		expect(
			monthlyCommitments([
				sub("CANCELLED", "NPR", 5_000),
				sub("NOT_RENEWING", "NPR", 5_000),
				sub("EXPIRED", "NPR", 5_000),
			]),
		).toEqual([]);
		expect(monthlyCommitments([])).toEqual([]);
	});
});
