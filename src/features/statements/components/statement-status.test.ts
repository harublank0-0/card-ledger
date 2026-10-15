import { describe, expect, it } from "vitest";

import { DUE_SOON_DAYS, statementTone } from "./statement-status";

describe("statementTone", () => {
	it("is red only for overdue statements and calm for paid ones", () => {
		expect(
			statementTone({ status: "OVERDUE", daysUntilDue: -2, paidMinor: 0 }),
		).toBe("danger");
		expect(
			statementTone({ status: "PAID", daysUntilDue: -40, paidMinor: 100 }),
		).toBe("success");
	});

	it("warns (amber, not red) when an unpaid statement is due soon", () => {
		for (const days of [0, 1, DUE_SOON_DAYS])
			expect(
				statementTone({ status: "OPEN", daysUntilDue: days, paidMinor: 0 }),
			).toBe("warning");
		expect(
			statementTone({ status: "OPEN", daysUntilDue: 3, paidMinor: 500 }),
		).toBe("warning");
	});

	it("stays neutral while the due date is further away", () => {
		expect(
			statementTone({
				status: "OPEN",
				daysUntilDue: DUE_SOON_DAYS + 1,
				paidMinor: 0,
			}),
		).toBe("neutral");
	});
});
