import { describe, expect, it } from "vitest";

import { last4FromPaste } from "./payment-methods.logic";

describe("last4FromPaste", () => {
	// maxLength={4} makes the browser keep the FIRST four characters of a paste, so pasting a
	// whole card number would have saved its first four digits as the "last 4".
	it("takes the last four digits of a pasted card number", () => {
		expect(last4FromPaste("4111 1111 1111 1234")).toBe("1234");
		expect(last4FromPaste("4111-1111-1111-9876")).toBe("9876");
		expect(last4FromPaste("4111111111111111")).toBe("1111");
	});

	it("keeps exactly four digits as they are", () => {
		expect(last4FromPaste("1234")).toBe("1234");
		expect(last4FromPaste(" 12 34 ")).toBe("1234");
	});

	it("keeps a short entry and ignores letters", () => {
		expect(last4FromPaste("12")).toBe("12");
		expect(last4FromPaste("ab-34")).toBe("34");
		expect(last4FromPaste("")).toBe("");
		expect(last4FromPaste("abcd")).toBe("");
	});
});
