import { z } from "zod";

import { isValidCalendarDate } from "#/lib/calendar-date";
import { optionalText, optionalUuid } from "#/lib/form-fields";
import { type CurrencyCode, currencySchema, parseMoney } from "#/lib/money";

export const PAGE_SIZE = 25;

/**
 * What the transaction form submits (strings) -> what the service stores.
 * The type is derived: a transaction with `refundOfId` is a refund, otherwise an expense, so
 * contradictory combinations cannot be expressed.
 */
export const transactionInputSchema = z
	.object({
		description: z.string().trim().min(1, "Description is required").max(120),
		amount: z.string().trim().min(1, "Amount is required"),
		currency: currencySchema,
		occurredOn: z
			.string()
			.trim()
			.refine(isValidCalendarDate, "Enter a valid date"),
		categoryId: optionalUuid,
		paymentMethodId: optionalUuid,
		subscriptionId: optionalUuid,
		refundOfId: optionalUuid,
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
		if (rest.refundOfId && rest.subscriptionId) {
			ctx.addIssue({
				code: "custom",
				path: ["subscriptionId"],
				message: "A refund cannot be linked to a subscription",
			});
			return z.NEVER;
		}
		return { ...rest, amountMinor };
	});

export type TransactionFormValues = z.input<typeof transactionInputSchema>;
export type TransactionData = z.output<typeof transactionInputSchema>;

// Filters live in the URL, so every field degrades to "not set" instead of failing the page.
const dateParam = z
	.string()
	.refine(isValidCalendarDate)
	.optional()
	.catch(undefined);
const idOrNone = z
	.union([z.uuid(), z.literal("none")])
	.optional()
	.catch(undefined);

export const transactionFiltersSchema = z
	.object({
		from: dateParam,
		to: dateParam,
		cardId: idOrNone,
		categoryId: idOrNone,
		type: z.enum(["EXPENSE", "REFUND"]).optional().catch(undefined),
		page: z.number().int().min(1).max(100_000).optional().catch(undefined),
	})
	.transform((f) =>
		// A reversed range is swapped rather than silently returning nothing.
		f.from && f.to && f.from > f.to ? { ...f, from: f.to, to: f.from } : f,
	);

export type TransactionFilters = z.output<typeof transactionFiltersSchema>;
