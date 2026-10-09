import { prisma } from "#/db";

import { DEFAULT_CATEGORY_NAMES, sameCategoryName } from "./categories.logic";

/** Every function takes `userId` first and scopes every query by it. */

/**
 * Seed the default categories once per user. Categories are archived, never deleted, so
 * "no categories at all (archived included)" only ever happens before the first seed.
 * The insert ignores conflicts, so concurrent first loads are safe.
 */
export async function ensureDefaultCategories(userId: string) {
	const existing = await prisma.category.count({ where: { userId } });
	if (existing > 0) return;
	await prisma.category.createMany({
		data: DEFAULT_CATEGORY_NAMES.map((name) => ({ userId, name })),
		skipDuplicates: true,
	});
}

export async function listCategories(
	userId: string,
	options: { includeArchived?: boolean } = {},
) {
	await ensureDefaultCategories(userId);
	return prisma.category.findMany({
		where: { userId, ...(options.includeArchived ? {} : { archivedAt: null }) },
		orderBy: { name: "asc" },
	});
}

async function assertNameFree(userId: string, name: string, exceptId?: string) {
	const all = await prisma.category.findMany({
		where: { userId },
		select: { id: true, name: true, archivedAt: true },
	});
	const clash = all.find(
		(c) => c.id !== exceptId && sameCategoryName(c.name, name),
	);
	if (clash) {
		throw new Error(
			clash.archivedAt
				? `A category named "${clash.name}" already exists (archived). Restore it instead.`
				: `A category named "${clash.name}" already exists`,
		);
	}
}

function isUniqueViolation(error: unknown) {
	return (
		typeof error === "object" &&
		error !== null &&
		(error as { code?: string }).code === "P2002"
	);
}

export async function createCategory(userId: string, name: string) {
	await ensureDefaultCategories(userId);
	await assertNameFree(userId, name);
	try {
		return await prisma.category.create({ data: { userId, name } });
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw new Error(`A category named "${name}" already exists`);
		}
		throw error;
	}
}

export async function renameCategory(userId: string, id: string, name: string) {
	await assertNameFree(userId, name, id);
	try {
		const { count } = await prisma.category.updateMany({
			where: { id, userId },
			data: { name },
		});
		if (count === 0) throw new Error("Category not found");
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw new Error(`A category named "${name}" already exists`);
		}
		throw error;
	}
}

/** Archive instead of delete so historical transactions keep their category. */
export async function setCategoryArchived(
	userId: string,
	id: string,
	archived: boolean,
) {
	const { count } = await prisma.category.updateMany({
		where: { id, userId },
		data: { archivedAt: archived ? new Date() : null },
	});
	if (count === 0) throw new Error("Category not found");
}
