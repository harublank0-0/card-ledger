import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { authMiddleware } from "#/lib/auth-middleware";

import {
	paymentInputSchema,
	statementFiltersSchema,
	statementInputSchema,
} from "./statements.schemas";

// The services import the database client, so load them inside handlers to keep them server-only.
const service = () => import("./statements.service.server");
// "Today" is the calendar date in the user's own time zone (notification settings).
const todayFor = async (userId: string) =>
	(
		await import("#/features/notifications/notifications.service.server")
	).getUserToday(userId);

export const listStatementsFn = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(statementFiltersSchema)
	.handler(async ({ context, data }) => {
		const today = await todayFor(context.user.id);
		const result = await (await service()).listStatements(context.user.id, {
			cardId: data.cardId,
			includePaid: data.paid ?? false,
			today,
		});
		return { today, ...result };
	});

export const getStatementFn = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(z.object({ id: z.uuid() }))
	.handler(async ({ context, data }) => {
		const today = await todayFor(context.user.id);
		return {
			today,
			statement: await (await service()).getStatement(
				context.user.id,
				data.id,
				today,
			),
		};
	});

export const getStatementDefaultsFn = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(z.object({ cardId: z.uuid() }))
	.handler(async ({ context, data }) => {
		const today = await todayFor(context.user.id);
		return {
			today,
			...(await (
				await service()
			).getStatementDefaults(context.user.id, data.cardId, today)),
		};
	});

export const createStatementFn = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(statementInputSchema)
	.handler(async ({ context, data }) =>
		(await service()).createStatement(context.user.id, data),
	);

export const updateStatementFn = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(z.object({ id: z.uuid(), values: statementInputSchema }))
	.handler(async ({ context, data }) => {
		await (await service()).updateStatement(
			context.user.id,
			data.id,
			data.values,
		);
	});

export const deleteStatementFn = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(z.object({ id: z.uuid() }))
	.handler(async ({ context, data }) => {
		await (await service()).deleteStatement(context.user.id, data.id);
	});

export const addPaymentFn = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(paymentInputSchema)
	.handler(async ({ context, data }) =>
		(await service()).addPayment(context.user.id, data),
	);

export const deletePaymentFn = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(z.object({ id: z.uuid() }))
	.handler(async ({ context, data }) => {
		await (await service()).deletePayment(context.user.id, data.id);
	});
