import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { authMiddleware } from "#/lib/auth-middleware";

import {
	archiveCategorySchema,
	createCategorySchema,
	renameCategorySchema,
} from "./categories.schemas";

// The service imports the database client, so load it inside handlers to keep it server-only.
const service = () => import("./categories.service.server");

export const listCategoriesFn = createServerFn({ method: "GET" })
	.middleware([authMiddleware])
	.validator(z.object({ includeArchived: z.boolean().optional() }).optional())
	.handler(async ({ context, data }) => {
		const rows = await (await service()).listCategories(
			context.user.id,
			data ?? {},
		);
		return rows.map((c) => ({
			id: c.id,
			name: c.name,
			archived: c.archivedAt !== null,
		}));
	});

export const createCategoryFn = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(createCategorySchema)
	.handler(async ({ context, data }) => {
		const created = await (await service()).createCategory(
			context.user.id,
			data.name,
		);
		return { id: created.id };
	});

export const renameCategoryFn = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(renameCategorySchema)
	.handler(async ({ context, data }) => {
		await (await service()).renameCategory(context.user.id, data.id, data.name);
	});

export const setCategoryArchivedFn = createServerFn({ method: "POST" })
	.middleware([authMiddleware])
	.validator(archiveCategorySchema)
	.handler(async ({ context, data }) => {
		await (await service()).setCategoryArchived(
			context.user.id,
			data.id,
			data.archived,
		);
	});
