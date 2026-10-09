import { z } from "zod";

import {
	MAX_CATEGORY_NAME_LENGTH,
	normalizeCategoryName,
} from "./categories.logic";

export const categoryNameSchema = z
	.string()
	.transform(normalizeCategoryName)
	.pipe(
		z
			.string()
			.min(1, "Name is required")
			.max(
				MAX_CATEGORY_NAME_LENGTH,
				`Use ${MAX_CATEGORY_NAME_LENGTH} characters or fewer`,
			),
	);

export const createCategorySchema = z.object({ name: categoryNameSchema });
export const renameCategorySchema = z.object({
	id: z.uuid(),
	name: categoryNameSchema,
});
export const archiveCategorySchema = z.object({
	id: z.uuid(),
	archived: z.boolean(),
});
