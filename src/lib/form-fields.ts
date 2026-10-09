import { z } from "zod";

/** Form inputs arrive as strings; these helpers turn "" into null and validate the rest. */

export function optionalText(max: number) {
	return z
		.string()
		.trim()
		.max(max, `Must be ${max} characters or fewer`)
		.transform((v) => (v === "" ? null : v));
}

export function optionalIntInRange(min: number, max: number, label: string) {
	return z
		.string()
		.trim()
		.transform((v, ctx) => {
			if (v === "") return null;
			if (!/^\d+$/.test(v) || Number(v) < min || Number(v) > max) {
				ctx.addIssue({
					code: "custom",
					message: `${label} must be a whole number from ${min} to ${max}`,
				});
				return z.NEVER;
			}
			return Number(v);
		});
}

import { isValidCalendarDate } from "#/lib/calendar-date";

export function optionalCalendarDate(label: string) {
	return z
		.string()
		.trim()
		.transform((v, ctx) => {
			if (v === "") return null;
			if (!isValidCalendarDate(v)) {
				ctx.addIssue({
					code: "custom",
					message: `${label} is not a valid date`,
				});
				return z.NEVER;
			}
			return v;
		});
}

/** An optional id from a form: "" becomes null, anything else must be a UUID. */
export const optionalUuid = z
	.string()
	.trim()
	.transform((v) => (v === "" ? null : v))
	.pipe(z.uuid().nullable());
