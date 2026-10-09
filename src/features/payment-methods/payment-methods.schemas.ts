import { z } from "zod";
import { optionalIntInRange, optionalText } from "#/lib/form-fields";
import { type CurrencyCode, currencySchema, parseMoney } from "#/lib/money";

/**
 * What the form submits (all strings) -> what the service stores.
 * Only the last four digits are ever accepted: full card numbers, CVV and PIN are never stored.
 */
export const paymentMethodInputSchema = z
	.object({
		name: z.string().trim().min(1, "Name is required").max(60),
		issuer: optionalText(60),
		last4: z
			.string()
			.trim()
			.regex(/^\d{4}$/, "Enter exactly the last 4 digits"),
		currency: currencySchema,
		creditLimit: z.string().trim(),
		statementDay: optionalIntInRange(1, 31, "Statement day"),
		paymentDueDay: optionalIntInRange(1, 31, "Payment due day"),
	})
	.transform(({ creditLimit, ...rest }, ctx) => {
		let creditLimitMinor: number | null = null;
		if (creditLimit !== "") {
			try {
				creditLimitMinor = parseMoney(
					creditLimit,
					rest.currency as CurrencyCode,
				);
			} catch (error) {
				ctx.addIssue({
					code: "custom",
					path: ["creditLimit"],
					message: error instanceof Error ? error.message : "Invalid amount",
				});
				return z.NEVER;
			}
			if (creditLimitMinor <= 0) {
				ctx.addIssue({
					code: "custom",
					path: ["creditLimit"],
					message: "Credit limit must be greater than zero",
				});
				return z.NEVER;
			}
		}
		return { ...rest, creditLimitMinor };
	});

export type PaymentMethodFormValues = z.input<typeof paymentMethodInputSchema>;
export type PaymentMethodData = z.output<typeof paymentMethodInputSchema>;

export const idSchema = z.object({ id: z.uuid() });
