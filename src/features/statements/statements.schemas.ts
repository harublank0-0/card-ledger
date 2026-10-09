import { z } from "zod";

import { isValidCalendarDate } from "#/lib/calendar-date";
import { optionalText } from "#/lib/form-fields";
import { type CurrencyCode, currencySchema, parseMoney } from "#/lib/money";

const date = (label: string) =>
	z.string().trim().refine(isValidCalendarDate, `Enter a valid ${label}`);

/**
 * What the statement form submits (strings) -> what the service stores.
 * The client sends the currency it shows; the service verifies it equals the card's.
 */
export const statementInputSchema = z
	.object({
		paymentMethodId: z.uuid(),
		currency: currencySchema,
		periodStart: date("start date"),
		periodEnd: date("end date"),
		dueDate: date("due date"),
		balance: z.string().trim().min(1, "Statement balance is required"),
		minimumDue: z.string().trim(),
	})
	.transform(({ balance, minimumDue, ...rest }, ctx) => {
		const fail = (path: string, message: string) => {
			ctx.addIssue({ code: "custom", path: [path], message });
			return z.NEVER;
		};
		const parse = (value: string, path: string) => {
			try {
				return parseMoney(value, rest.currency as CurrencyCode);
			} catch (error) {
				return fail(
					path,
					error instanceof Error ? error.message : "Invalid amount",
				);
			}
		};
		const statementBalanceMinor = parse(balance, "balance");
		if (statementBalanceMinor === z.NEVER) return z.NEVER;
		let minimumDueMinor: number | null = null;
		if (minimumDue !== "") {
			const minimum = parse(minimumDue, "minimumDue");
			if (minimum === z.NEVER) return z.NEVER;
			if (minimum > statementBalanceMinor) {
				return fail(
					"minimumDue",
					"Minimum due cannot be more than the statement balance",
				);
			}
			minimumDueMinor = minimum;
		}
		if (rest.periodEnd < rest.periodStart) {
			return fail("periodEnd", "The period cannot end before it starts");
		}
		if (rest.dueDate < rest.periodEnd) {
			return fail("dueDate", "The due date cannot be before the period ends");
		}
		return { ...rest, statementBalanceMinor, minimumDueMinor };
	});

export type StatementFormValues = z.input<typeof statementInputSchema>;
export type StatementData = z.output<typeof statementInputSchema>;

export const paymentInputSchema = z
	.object({
		statementId: z.uuid(),
		currency: currencySchema,
		amount: z.string().trim().min(1, "Amount is required"),
		paidOn: date("payment date"),
		notes: optionalText(500),
	})
	.transform(({ amount, ...rest }, ctx) => {
		let amountMinor: number;
		try {
			amountMinor = parseMoney(amount, rest.currency as CurrencyCode);
		} catch (error) {
			ctx.addIssue({
				code: "custom",
				path: ["amount"],
				message: error instanceof Error ? error.message : "Invalid amount",
			});
			return z.NEVER;
		}
		if (amountMinor <= 0) {
			ctx.addIssue({
				code: "custom",
				path: ["amount"],
				message: "Amount must be greater than zero",
			});
			return z.NEVER;
		}
		return { ...rest, amountMinor };
	});

export type PaymentFormValues = z.input<typeof paymentInputSchema>;
export type PaymentData = z.output<typeof paymentInputSchema>;

// Filters live in the URL, so each field falls back to "not set" instead of failing the page.
export const statementFiltersSchema = z.object({
	cardId: z.uuid().optional().catch(undefined),
	paid: z.boolean().optional().catch(undefined),
});
export type StatementFilters = z.output<typeof statementFiltersSchema>;
