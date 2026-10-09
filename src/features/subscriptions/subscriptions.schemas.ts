import { z } from "zod";

import { isValidCalendarDate } from "#/lib/calendar-date";
import { optionalCalendarDate, optionalText } from "#/lib/form-fields";
import { type CurrencyCode, currencySchema, parseMoney } from "#/lib/money";

/**
 * What the form submits (strings) -> what the service stores.
 * An expected renewal is never a completed transaction; nothing here records a charge.
 */
export const subscriptionInputSchema = z
	.object({
		name: z.string().trim().min(1, "Name is required").max(80),
		amount: z.string().trim().min(1, "Amount is required"),
		currency: currencySchema,
		intervalCount: z
			.string()
			.trim()
			.regex(/^\d{1,3}$/, "Enter a whole number from 1 to 365")
			.transform(Number)
			.refine((n) => n >= 1 && n <= 365, "Enter a whole number from 1 to 365"),
		intervalUnit: z.enum(["WEEK", "MONTH", "YEAR"]),
		anchorDate: z
			.string()
			.trim()
			.refine(isValidCalendarDate, "Enter a valid date"),
		paymentMethodId: z
			.string()
			.trim()
			.transform((v) => (v === "" ? null : v))
			.pipe(z.uuid().nullable()),
		autoRenew: z.boolean(),
		expiresOn: optionalCalendarDate("Expiry date"),
		cancellationDeadline: optionalCalendarDate("Cancellation deadline"),
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
		if (rest.expiresOn && rest.expiresOn < rest.anchorDate) {
			ctx.addIssue({
				code: "custom",
				path: ["expiresOn"],
				message: "Expiry cannot be before the first billing date",
			});
			return z.NEVER;
		}
		return { ...rest, amountMinor };
	});

export type SubscriptionFormValues = z.input<typeof subscriptionInputSchema>;
export type SubscriptionData = z.output<typeof subscriptionInputSchema>;

export const cancelSubscriptionSchema = z.object({
	id: z.uuid(),
	/** Last day the plan stays valid (end of the paid period), if known. */
	expiresOn: optionalCalendarDate("End date"),
});
