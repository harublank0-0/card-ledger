import { describe, expect, it } from "vitest";

import {
	CSV_ENTITIES,
	csvCell,
	exportFilename,
	isCsvEntity,
	toCsv,
} from "./export.logic";

describe("csvCell", () => {
	it("writes plain values as they are", () => {
		expect(csvCell("Groceries")).toBe("Groceries");
		expect(csvCell(64900)).toBe("64900");
		expect(csvCell(0)).toBe("0");
		expect(csvCell(true)).toBe("true");
		expect(csvCell(false)).toBe("false");
		expect(csvCell("2026-10-10")).toBe("2026-10-10");
	});

	it("writes null and undefined as empty", () => {
		expect(csvCell(null)).toBe("");
		expect(csvCell(undefined)).toBe("");
	});

	it("quotes values with commas, quotes or line breaks, doubling quotes", () => {
		expect(csvCell("a,b")).toBe('"a,b"');
		expect(csvCell('say "hi"')).toBe('"say ""hi"""');
		expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
		expect(csvCell("line1\r\nline2")).toBe('"line1\r\nline2"');
	});

	it("keeps unicode intact", () => {
		expect(csvCell("काठमाडौं café ₹")).toBe("काठमाडौं café ₹");
	});

	it.each([
		"=",
		"+",
		"-",
		"@",
		"\t",
		"\r",
	])("neutralises a leading %j so it cannot become a formula", (lead) => {
		const cell = csvCell(`${lead}SUM(A1:A9)`);
		expect(cell.replace(/^"/, "").startsWith("'")).toBe(true);
		expect(cell.replace(/^"/, "")).not.toMatch(/^[=+\-@\t\r]/);
	});

	it("neutralises the classic payloads and still quotes them correctly", () => {
		expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(
			`"'=HYPERLINK(""http://evil"",""x"")"`,
		);
		expect(csvCell("@cmd|' /C calc'!A0")).toBe(`'@cmd|' /C calc'!A0`);
		expect(csvCell("-2+3")).toBe("'-2+3");
	});

	it("does not touch text where the dangerous character is not first", () => {
		expect(csvCell("Coffee = good")).toBe("Coffee = good");
		expect(csvCell("a-b")).toBe("a-b");
		expect(csvCell("name@example.test")).toBe("name@example.test");
	});

	it("does not alter genuine numbers, even negative ones", () => {
		expect(csvCell(-5)).toBe("-5");
	});
});

describe("toCsv", () => {
	it("writes a header, rows in column order, and CRLF line endings", () => {
		const csv = toCsv(
			[
				{ b: "2", a: "1", ignored: "x" },
				{ a: "x,y", b: null },
			],
			["a", "b"],
		);
		expect(csv).toBe('a,b\r\n1,2\r\n"x,y",\r\n');
	});

	it("is just the header for no rows", () => {
		expect(toCsv([], ["id", "name"])).toBe("id,name\r\n");
	});

	it("writes missing keys as empty cells", () => {
		expect(toCsv([{ a: "1" }], ["a", "b", "c"])).toBe("a,b,c\r\n1,,\r\n");
	});
});

describe("CSV entities", () => {
	it("knows exactly the documented downloads", () => {
		expect(Object.keys(CSV_ENTITIES)).toEqual([
			"categories",
			"cards",
			"subscriptions",
			"transactions",
			"statements",
			"statement-payments",
		]);
		expect(isCsvEntity("transactions")).toBe(true);
		expect(isCsvEntity("statement-payments")).toBe(true);
		for (const bad of [
			"",
			"users",
			"sessions",
			"../etc/passwd",
			"__proto__",
			"toString",
		]) {
			expect(isCsvEntity(bad)).toBe(false);
		}
	});

	it("never exposes secrets or internal columns", () => {
		for (const entity of Object.values(CSV_ENTITIES)) {
			for (const column of entity.columns) {
				expect(column).not.toMatch(/password|token|secret|userId|hash/i);
			}
		}
	});

	it("has unique columns that start with the id", () => {
		for (const entity of Object.values(CSV_ENTITIES)) {
			expect(new Set(entity.columns).size).toBe(entity.columns.length);
			expect(entity.columns[0]).toBe("id");
		}
	});
});

describe("exportFilename", () => {
	it("names files with the entity and date", () => {
		expect(exportFilename("transactions", "csv", "2026-10-10")).toBe(
			"card-ledger-transactions-2026-10-10.csv",
		);
		expect(exportFilename("everything", "json", "2026-10-10")).toBe(
			"card-ledger-everything-2026-10-10.json",
		);
	});
});
