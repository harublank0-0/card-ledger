import { createServerFn } from "@tanstack/react-start";

import { env } from "#/env";
import { authMiddleware } from "#/lib/auth-middleware";

import { notificationPreferencesSchema } from "./notifications.schemas";

// The service imports the database client, so load it inside handlers to keep it server-only.
const service = () => import("./notifications.service.server");

export const getNotificationPreferencesFn = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.handler(async ({ context }) => {
		const { mailTransportKind } = await import("#/lib/mailer.server");
		const prefs = await (await service()).getPreferences(context.user.id);
		return {
			timezone: prefs.timezone,
			emailEnabled: prefs.emailEnabled,
			offsetsDays: prefs.offsetsDays,
			renewalEnabled: prefs.renewalEnabled,
			expiryEnabled: prefs.expiryEnabled,
			cancellationEnabled: prefs.cancellationEnabled,
			paymentDueEnabled: prefs.paymentDueEnabled,
			mail: mailTransportKind({
				host: env.SMTP_HOST,
				production: process.env.NODE_ENV === "production",
			}),
		};
	});

export const updateNotificationPreferencesFn = createServerFn({
	method: "POST",
})
	.middleware([authMiddleware])
	.validator(notificationPreferencesSchema)
	.handler(async ({ context, data }) => {
		await (await service()).updatePreferences(context.user.id, data);
	});
