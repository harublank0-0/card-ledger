import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { authMiddleware } from "#/lib/auth-middleware";

import {
	transactionFiltersSchema,
	transactionInputSchema,
} from "./transactions.schemas";

// The service imports the database client, so load it inside handlers to keep it server-only.
const service = () => import("./transactions.service.server");

export const listTransactionsFn = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(transactionFiltersSchema)
	.handler(async ({ context, data }) =>
		(await service()).listTransactions(context.user.id, data),
	);

export const getTransactionFn = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(z.object({ id: z.uuid() }))
	.handler(async ({ context, data }) =>
		(await service()).getTransaction(context.user.id, data.id),
	);

export const createTransactionFn = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(transactionInputSchema)
	.handler(async ({ context, data }) =>
		(await service()).createTransaction(context.user.id, data),
	);

export const updateTransactionFn = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(z.object({ id: z.uuid(), values: transactionInputSchema }))
	.handler(async ({ context, data }) => {
		await (await service()).updateTransaction(
			context.user.id,
			data.id,
			data.values,
		);
	});

export const deleteTransactionFn = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(z.object({ id: z.uuid() }))
	.handler(async ({ context, data }) => {
		await (await service()).deleteTransaction(context.user.id, data.id);
	});
