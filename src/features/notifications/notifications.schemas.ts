import { z } from "zod";

import { isValidTimeZone } from "#/lib/calendar-date";

import { ALLOWED_OFFSETS } from "./notifications.logic";

export const notificationPreferencesSchema = z.object({
	timezone: z
		.string()
		.trim()
		.refine(isValidTimeZone, "Choose a valid time zone, e.g. Asia/Kathmandu"),
	emailEnabled: z.boolean(),
	offsetsDays: z
		.array(z.number().int())
		.refine(
			(values) =>
				values.every((v) => (ALLOWED_OFFSETS as readonly number[]).includes(v)),
			"Unsupported reminder day",
		)
		.transform((values) => [...new Set(values)].sort((a, b) => b - a)),
	renewalEnabled: z.boolean(),
	expiryEnabled: z.boolean(),
	cancellationEnabled: z.boolean(),
	paymentDueEnabled: z.boolean(),
});

export type NotificationPreferencesValues = z.input<
	typeof notificationPreferencesSchema
>;
export type NotificationPreferencesData = z.output<
	typeof notificationPreferencesSchema
>;
