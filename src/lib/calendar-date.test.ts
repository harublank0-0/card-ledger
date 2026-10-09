import { describe, expect, it } from "vitest";

import {
	addDays,
	addMonths,
	compareCalendarDates,
	daysInMonth,
	diffInDays,
	isLeapYear,
	isValidCalendarDate,
	nextMonthlyOccurrence,
	todayIn,
} from "./calendar-date";

describe("leap years and month lengths", () => {
	it("applies the Gregorian rules", () => {
		expect(isLeapYear(2024)).toBe(true);
		expect(isLeapYear(2023)).toBe(false);
		expect(isLeapYear(1900)).toBe(false);
		expect(isLeapYear(2000)).toBe(true);
		expect(daysInMonth(2024, 2)).toBe(29);
		expect(daysInMonth(2025, 2)).toBe(28);
		expect(daysInMonth(2025, 4)).toBe(30);
		expect(daysInMonth(2025, 12)).toBe(31);
	});
});

describe("isValidCalendarDate", () => {
	it.each(["2024-02-29", "2025-12-31", "2025-01-01"])("accepts %s", (v) => {
		expect(isValidCalendarDate(v)).toBe(true);
	});
	it.each([
		"2025-02-29",
		"2025-13-01",
		"2025-00-10",
		"2025-04-31",
		"25-01-01",
		"2025-1-1",
		"",
		"2025-01-01T00:00:00Z",
	])("rejects %s", (v) => {
		expect(isValidCalendarDate(v)).toBe(false);
	});
});

describe("addMonths", () => {
	it("clamps to the end of shorter months", () => {
		expect(addMonths("2025-01-31", 1)).toBe("2025-02-28");
		expect(addMonths("2024-01-31", 1)).toBe("2024-02-29");
		expect(addMonths("2025-01-31", 3)).toBe("2025-04-30");
	});
	it("does not drift when computed from the anchor", () => {
		expect(addMonths("2025-01-31", 2)).toBe("2025-03-31");
	});
	it("crosses year boundaries in both directions", () => {
		expect(addMonths("2025-11-15", 3)).toBe("2026-02-15");
		expect(addMonths("2025-01-15", -2)).toBe("2024-11-15");
		expect(addMonths("2025-12-31", 12)).toBe("2026-12-31");
	});
	it("handles a leap day anniversary", () => {
		expect(addMonths("2024-02-29", 12)).toBe("2025-02-28");
		expect(addMonths("2024-02-29", 48)).toBe("2028-02-29");
	});
});

describe("addDays and diffInDays", () => {
	it("moves across month, year and leap boundaries", () => {
		expect(addDays("2025-01-31", 1)).toBe("2025-02-01");
		expect(addDays("2025-12-31", 1)).toBe("2026-01-01");
		expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
		expect(addDays("2025-03-01", -1)).toBe("2025-02-28");
	});
	it("counts days between dates", () => {
		expect(diffInDays("2025-01-01", "2025-01-08")).toBe(7);
		expect(diffInDays("2024-02-28", "2024-03-01")).toBe(2);
		expect(diffInDays("2025-01-08", "2025-01-01")).toBe(-7);
	});
	it("is unaffected by daylight-saving shifts", () => {
		expect(diffInDays("2025-03-08", "2025-03-10")).toBe(2);
		expect(diffInDays("2025-11-01", "2025-11-03")).toBe(2);
	});
});

describe("compareCalendarDates", () => {
	it("orders chronologically", () => {
		expect(compareCalendarDates("2025-01-01", "2025-01-02")).toBe(-1);
		expect(compareCalendarDates("2025-01-02", "2025-01-02")).toBe(0);
		expect(compareCalendarDates("2026-01-01", "2025-12-31")).toBe(1);
	});
});

describe("todayIn", () => {
	it("uses the requested time zone, not UTC", () => {
		// 20:30 UTC on Jan 1 is already Jan 2, 02:15 in Kathmandu (UTC+5:45).
		const now = new Date("2025-01-01T20:30:00Z");
		expect(todayIn("UTC", now)).toBe("2025-01-01");
		expect(todayIn("Asia/Kathmandu", now)).toBe("2025-01-02");
	});
	it("can be behind UTC", () => {
		const now = new Date("2025-01-01T03:00:00Z");
		expect(todayIn("America/New_York", now)).toBe("2024-12-31");
	});
});

describe("nextMonthlyOccurrence", () => {
	it("returns this month when the day is still ahead or today", () => {
		expect(nextMonthlyOccurrence(20, "2025-03-05")).toBe("2025-03-20");
		expect(nextMonthlyOccurrence(20, "2025-03-20")).toBe("2025-03-20");
	});
	it("rolls to next month once the day has passed", () => {
		expect(nextMonthlyOccurrence(20, "2025-03-21")).toBe("2025-04-20");
		expect(nextMonthlyOccurrence(5, "2025-12-31")).toBe("2026-01-05");
	});
	it("clamps short months", () => {
		expect(nextMonthlyOccurrence(31, "2025-02-10")).toBe("2025-02-28");
		expect(nextMonthlyOccurrence(31, "2024-02-10")).toBe("2024-02-29");
		expect(nextMonthlyOccurrence(31, "2025-04-30")).toBe("2025-04-30");
		expect(nextMonthlyOccurrence(30, "2025-01-31")).toBe("2025-02-28");
	});
});
