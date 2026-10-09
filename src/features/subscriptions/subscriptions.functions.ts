import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "#/lib/auth-middleware";

import {
	cancelSubscriptionSchema,
	subscriptionInputSchema,
} from "./subscriptions.schemas";

// The service imports the database client, so load it inside handlers to keep it server-only.
const service = () => import("./subscriptions.service.server");

// "Today" is the calendar date in the user's own time zone (notification settings).
const todayFor = async (userId: string) =>
	(
		await import("#/features/notifications/notifications.service.server")
	).getUserToday(userId);

export const listSubscriptionsFn = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(z.object({ includeArchived: z.boolean().optional() }).optional())
	.handler(async ({ context, data }) => {
		const now = await todayFor(context.user.id);
		const subscriptions = await (await service()).listSubscriptions(
			context.user.id,
			{ today: now, includeArchived: data?.includeArchived },
		);
		return { today: now, subscriptions };
	});

export const getSubscriptionFn = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(z.object({ id: z.uuid() }))
	.handler(async ({ context, data }) =>
		(await service()).getSubscription(
			context.user.id,
			data.id,
			await todayFor(context.user.id),
		),
	);

export const createSubscriptionFn = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(subscriptionInputSchema)
	.handler(async ({ context, data }) => {
		const created = await (await service()).createSubscription(
			context.user.id,
			data,
		);
		return { id: created.id };
	});

export const updateSubscriptionFn = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(z.object({ id: z.uuid(), values: subscriptionInputSchema }))
	.handler(async ({ context, data }) => {
		await (await service()).updateSubscription(
			context.user.id,
			data.id,
			data.values,
		);
	});

export const cancelSubscriptionFn = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(cancelSubscriptionSchema)
	.handler(async ({ context, data }) => {
		await (await service()).cancelSubscription(context.user.id, data.id, {
			today: await todayFor(context.user.id),
			expiresOn: data.expiresOn,
		});
	});

export const reactivateSubscriptionFn = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(z.object({ id: z.uuid() }))
	.handler(async ({ context, data }) => {
		await (await service()).reactivateSubscription(context.user.id, data.id);
	});

export const setSubscriptionArchivedFn = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(z.object({ id: z.uuid(), archived: z.boolean() }))
	.handler(async ({ context, data }) => {
		await (await service()).setSubscriptionArchived(
			context.user.id,
			data.id,
			data.archived,
		);
	});
