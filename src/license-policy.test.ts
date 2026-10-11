import { describe, expect, it } from "vitest";

import {
	classifyLicense,
	EXCEPTIONS,
	evaluatePackage,
} from "../scripts/license-policy";

describe("classifyLicense", () => {
	it.each([
		"MIT",
		"MIT-0",
		"ISC",
		"BSD-2-Clause",
		"BSD-3-Clause",
		"0BSD",
		"Apache-2.0",
		"Unlicense",
		"CC0-1.0",
		"Python-2.0",
		"MPL-2.0",
		"CC-BY-4.0",
		"AGPL-3.0-only",
		"GPL-3.0-or-later",
		"LGPL-3.0-only",
		"GPL-2.0-or-later",
	])("allows %s", (license) => {
		expect(classifyLicense(license)).toBe("allowed");
	});

	it.each([
		"GPL-2.0-only",
		"GPL-2.0",
		"SSPL-1.0",
		"BUSL-1.1",
		"Elastic-2.0",
		"CC-BY-NC-4.0",
		"CC-BY-NC-SA-4.0",
		"UNLICENSED",
		"Commons-Clause",
	])("forbids %s", (license) => {
		expect(classifyLicense(license)).toBe("forbidden");
	});

	it.each([
		"EPL-2.0",
		"WTFPL",
		"SEE LICENSE IN LICENSE.txt",
		"GPL-2.0 WITH Classpath-exception-2.0",
		"",
		null,
		undefined,
	])("does not decide %s on its own", (license) => {
		expect(classifyLicense(license)).toBe("unknown");
	});

	it("is case-insensitive", () => {
		expect(classifyLicense("mit")).toBe("allowed");
		expect(classifyLicense("apache-2.0")).toBe("allowed");
	});

	describe("SPDX expressions", () => {
		it("allows an OR when any alternative is allowed", () => {
			expect(classifyLicense("(MIT OR Apache-2.0)")).toBe("allowed");
			expect(classifyLicense("(GPL-2.0-only OR MIT)")).toBe("allowed");
			expect(classifyLicense("GPL-2.0-only OR MIT")).toBe("allowed");
		});

		it("requires every part of an AND to be allowed", () => {
			expect(classifyLicense("MIT AND ISC")).toBe("allowed");
			expect(classifyLicense("MIT and ISC")).toBe("allowed");
			expect(classifyLicense("(GPL-2.0-only AND MIT)")).toBe("forbidden");
			expect(classifyLicense("MIT AND EPL-2.0")).toBe("unknown");
		});

		it("gives AND precedence over OR", () => {
			// MIT OR (GPL-2.0-only AND ISC): MIT alone is enough.
			expect(classifyLicense("MIT OR GPL-2.0-only AND ISC")).toBe("allowed");
			// (MIT OR GPL-2.0-only) AND SSPL-1.0 would be forbidden.
			expect(classifyLicense("(MIT OR GPL-2.0-only) AND SSPL-1.0")).toBe(
				"forbidden",
			);
		});

		it("handles nesting and stray whitespace", () => {
			expect(classifyLicense("  ( ( MIT )  OR  ( ISC ) ) ")).toBe("allowed");
		});

		it("treats an unbalanced expression as unknown rather than guessing", () => {
			expect(classifyLicense("(MIT OR ISC")).toBe("unknown");
			expect(classifyLicense("MIT OR")).toBe("unknown");
		});
	});
});

describe("evaluatePackage", () => {
	const pkg = (license: string | null, name = "left-pad") => ({
		name,
		version: "1.0.0",
		license,
	});

	it("passes an allowed licence", () => {
		expect(evaluatePackage(pkg("MIT"), {}).status).toBe("ok");
	});

	it("fails a forbidden licence", () => {
		const finding = evaluatePackage(pkg("GPL-2.0-only"), {});
		expect(finding.status).toBe("fail");
		expect(finding.reason).toMatch(/not compatible/i);
	});

	it("fails an undecided licence unless the package has a documented exception", () => {
		expect(evaluatePackage(pkg(null), {}).status).toBe("fail");
		const excused = evaluatePackage(pkg(null), {
			"left-pad": "MIT file present, field missing",
		});
		expect(excused.status).toBe("exception");
		expect(excused.reason).toContain("MIT file present");
	});

	it("never lets an exception excuse a forbidden licence", () => {
		const finding = evaluatePackage(pkg("SSPL-1.0"), {
			"left-pad": "trust me",
		});
		expect(finding.status).toBe("fail");
	});

	it("keeps the project's own exceptions short and justified", () => {
		expect(Object.keys(EXCEPTIONS).sort()).toEqual(["elkjs"]);
		for (const reason of Object.values(EXCEPTIONS)) {
			expect(reason.length).toBeGreaterThan(40);
		}
	});
});
