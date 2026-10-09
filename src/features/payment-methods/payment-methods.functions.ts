import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { authMiddleware } from "#/lib/auth-middleware";

import { idSchema, paymentMethodInputSchema } from "./payment-methods.schemas";

// The service imports the database client, so load it inside handlers to keep it server-only.
const service = () => import("./payment-methods.service.server");

export const listPaymentMethodsFn = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(z.object({ includeArchived: z.boolean().optional() }).optional())
	.handler(async ({ context, data }) =>
		(await service()).listPaymentMethods(context.user.id, data ?? {}),
	);

export const getPaymentMethodFn = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(idSchema)
	.handler(async ({ context, data }) =>
		(await service()).getPaymentMethod(context.user.id, data.id),
	);

export const createPaymentMethodFn = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(paymentMethodInputSchema)
	.handler(async ({ context, data }) =>
		(await service()).createPaymentMethod(context.user.id, data),
	);

export const updatePaymentMethodFn = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(z.object({ id: z.uuid(), values: paymentMethodInputSchema }))
	.handler(async ({ context, data }) =>
		(await service()).updatePaymentMethod(
			context.user.id,
			data.id,
			data.values,
		),
	);

export const setPaymentMethodArchivedFn = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(z.object({ id: z.uuid(), archived: z.boolean() }))
	.handler(async ({ context, data }) =>
		(await service()).setPaymentMethodArchived(
			context.user.id,
			data.id,
			data.archived,
		),
	);
