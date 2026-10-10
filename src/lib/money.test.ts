import { describe, expect, it } from "vitest";

import {
	formatMoney,
	minorToInputString,
	parseMoney,
	sumMinor,
	totalsByCurrency,
} from "./money";

describe("parseMoney", () => {
	it.each([
		["499", "NPR", 49900],
		["499.00", "NPR", 49900],
		["499.5", "USD", 49950],
		["0.99", "USD", 99],
		["1,299.50", "NPR", 129950],
		["  12.05 ", "USD", 1205],
		["1500", "JPY", 1500],
	] as const)("parses %s %s", (input, currency, expected) => {
		expect(parseMoney(input, currency)).toBe(expected);
	});

	it("is exact where floats are not", () => {
		// 0.1 + 0.2 and 1.005 * 100 are classic float traps.
		expect(parseMoney("0.30", "USD")).toBe(30);
		expect(parseMoney("1.005".slice(0, 4), "USD")).toBe(100);
		expect(parseMoney("19.99", "USD")).toBe(1999);
		expect(parseMoney("8.20", "USD")).toBe(820);
	});

	it.each([
		"",
		"abc",
		"-5",
		"1.2.3",
		"12,34,5x",
		".5",
		"5.",
	])("rejects %j", (input) => {
		expect(() => parseMoney(input, "USD")).toThrow();
	});

	// A comma is only ever a digit-grouping separator (1,299.50; or 12,34,567 in the South Asian
	// style). Read as a decimal comma it used to be deleted, turning "12,50" into 1250.00.
	it.each([
		["1,000", "NPR", 100000],
		["1,299.50", "NPR", 129950],
		["1,234,567.89", "USD", 123456789],
		["12,34,567", "NPR", 123456700],
		["1,29,950.00", "NPR", 12995000],
		["10,00,000", "NPR", 100000000],
	] as const)("accepts proper digit grouping: %s %s", (input, currency, expected) => {
		expect(parseMoney(input, currency)).toBe(expected);
	});

	it.each([
		"12,50",
		"1,5",
		"150,00",
		"0,5",
		"1,2,3",
		"1,00",
		"1,0000",
		",5",
		"5,",
		"1,000,00",
		"12,50.00",
		"1,23,45",
	])("rejects a comma that is not digit grouping: %j", (input) => {
		expect(() => parseMoney(input, "EUR")).toThrow();
	});

	it("tells the user to use a dot for decimals when a comma is the problem", () => {
		expect(() => parseMoney("12,50", "EUR")).toThrow(/dot/i);
	});

	it("rejects too many decimals instead of rounding", () => {
		expect(() => parseMoney("1.005", "USD")).toThrow(/at most 2/);
		expect(() => parseMoney("1.5", "JPY")).toThrow(/does not use decimals/);
	});

	it("rejects amounts beyond the INT column", () => {
		expect(() => parseMoney("99999999999", "USD")).toThrow(/too large/);
	});
});

describe("minorToInputString / formatMoney", () => {
	it("round-trips editing strings", () => {
		expect(minorToInputString(49900, "NPR")).toBe("499.00");
		expect(minorToInputString(5, "USD")).toBe("0.05");
		expect(minorToInputString(1500, "JPY")).toBe("1500");
		expect(parseMoney(minorToInputString(129950, "NPR"), "NPR")).toBe(129950);
	});

	it("formats for display with the currency code", () => {
		expect(formatMoney(129950, "NPR")).toContain("1,299.50");
		expect(formatMoney(129950, "NPR")).toContain("NPR");
		expect(formatMoney(99, "USD")).toContain("0.99");
	});
});

describe("summing", () => {
	const items = [
		{ amountMinor: 1000, currency: "NPR" },
		{ amountMinor: 250, currency: "NPR" },
		{ amountMinor: 999, currency: "USD" },
	];

	it("sums one currency", () => {
		expect(sumMinor(items.slice(0, 2), "NPR")).toBe(1250);
	});

	it("refuses to mix currencies", () => {
		expect(() => sumMinor(items, "NPR")).toThrow(/Cannot add USD to NPR/);
	});

	it("groups totals per currency", () => {
		expect(Object.fromEntries(totalsByCurrency(items))).toEqual({
			NPR: 1250,
			USD: 999,
		});
	});
});
