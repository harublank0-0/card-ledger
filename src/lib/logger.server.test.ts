import { describe, expect, it } from "vitest";

import { errorClass, formatLogLine } from "./logger.server";

const NOW = new Date("2026-10-10T12:00:00.000Z");

describe("formatLogLine", () => {
	it("emits one JSON object per line with time, level and message", () => {
		const line = formatLogLine("info", "server started", { port: 3000 }, NOW);
		expect(line.includes("\n")).toBe(false);
		expect(JSON.parse(line)).toEqual({
			time: "2026-10-10T12:00:00.000Z",
			level: "info",
			msg: "server started",
			port: 3000,
		});
	});

	it("keeps messages with newlines on a single line", () => {
		const line = formatLogLine("warn", "a\nb", undefined, NOW);
		expect(line.includes("\n")).toBe(false);
		expect(JSON.parse(line).msg).toBe("a\nb");
	});

	it("does not let fields overwrite the reserved keys", () => {
		const line = formatLogLine(
			"error",
			"real message",
			{ time: "yesterday", level: "debug", msg: "spoofed" },
			NOW,
		);
		expect(JSON.parse(line)).toEqual({
			time: "2026-10-10T12:00:00.000Z",
			level: "error",
			msg: "real message",
		});
	});

	it("drops anything that is not a plain string, number, boolean or null", () => {
		const fields = {
			ok: "yes",
			count: 2,
			flag: false,
			nothing: null,
			nested: { amount: 123456 },
			list: [1, 2],
			error: new Error("card 4242 declined"),
			missing: undefined,
		} as unknown as Parameters<typeof formatLogLine>[2];
		const parsed = JSON.parse(formatLogLine("info", "x", fields, NOW));
		expect(parsed).toEqual({
			time: "2026-10-10T12:00:00.000Z",
			level: "info",
			msg: "x",
			ok: "yes",
			count: 2,
			flag: false,
			nothing: null,
		});
		expect(JSON.stringify(parsed)).not.toContain("4242");
		expect(JSON.stringify(parsed)).not.toContain("123456");
	});
});

describe("errorClass", () => {
	it("returns the class name and never the message", () => {
		class ConnectionRefused extends Error {}
		const name = errorClass(new ConnectionRefused("password=hunter2"));
		expect(name).toBe("ConnectionRefused");
		expect(name).not.toContain("hunter2");
	});

	it("falls back for values that are not errors", () => {
		expect(errorClass("boom")).toBe("UnknownError");
		expect(errorClass(null)).toBe("UnknownError");
	});
});
