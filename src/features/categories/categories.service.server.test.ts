import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "#/db";
import { createTestUser, deleteTestUsers } from "#/test/helpers";

import { DEFAULT_CATEGORY_NAMES } from "./categories.logic";
import {
	createCategorySchema,
	renameCategorySchema,
} from "./categories.schemas";
import {
	createCategory,
	ensureDefaultCategories,
	listCategories,
	renameCategory,
	setCategoryArchived,
} from "./categories.service.server";

let alice: { id: string };
let bob: { id: string };

beforeAll(async () => {
	alice = await createTestUser();
	bob = await createTestUser();
});
afterAll(async () => {
	await deleteTestUsers([alice.id, bob.id]);
});
beforeEach(async () => {
	await prisma.category.deleteMany({
		where: { userId: { in: [alice.id, bob.id] } },
	});
});

const names = (rows: { name: string }[]) => rows.map((r) => r.name);

describe("default categories", () => {
	it("are seeded on first use", async () => {
		const rows = await listCategories(alice.id);
		expect(names(rows).sort()).toEqual([...DEFAULT_CATEGORY_NAMES].sort());
	});

	it("are seeded only once, even after everything is archived", async () => {
		const first = await listCategories(alice.id);
		for (const c of first) await setCategoryArchived(alice.id, c.id, true);
		expect(await listCategories(alice.id)).toEqual([]);
		await ensureDefaultCategories(alice.id);
		expect(await prisma.category.count({ where: { userId: alice.id } })).toBe(
			DEFAULT_CATEGORY_NAMES.length,
		);
	});

	it("survive concurrent first loads without duplicates or errors", async () => {
		await Promise.all([
			listCategories(bob.id),
			listCategories(bob.id),
			listCategories(bob.id),
		]);
		expect(await prisma.category.count({ where: { userId: bob.id } })).toBe(
			DEFAULT_CATEGORY_NAMES.length,
		);
	});

	it("are per user", async () => {
		await createCategory(alice.id, "Pets");
		expect(names(await listCategories(bob.id))).not.toContain("Pets");
	});
});

describe("create and rename", () => {
	it("rejects duplicates case-insensitively, including archived ones", async () => {
		await createCategory(alice.id, "Pets");
		await expect(createCategory(alice.id, "pets")).rejects.toThrow(
			"already exists",
		);
		const rows = await listCategories(alice.id);
		const groceries = rows.find((r) => r.name === "Groceries");
		await setCategoryArchived(alice.id, groceries?.id as string, true);
		await expect(createCategory(alice.id, " GROCERIES ")).rejects.toThrow(
			"Restore it instead",
		);
	});

	it("allows the same name for different users", async () => {
		await createCategory(alice.id, "Pets");
		await expect(createCategory(bob.id, "Pets")).resolves.toBeDefined();
	});

	it("renames and still blocks clashes with other categories", async () => {
		const pets = await createCategory(alice.id, "Pets");
		await renameCategory(alice.id, pets.id, "Animals");
		expect(names(await listCategories(alice.id))).toContain("Animals");
		await expect(renameCategory(alice.id, pets.id, "dining")).rejects.toThrow(
			"already exists",
		);
		await expect(
			renameCategory(alice.id, pets.id, "ANIMALS"),
		).resolves.toBeUndefined(); // own name, new case
	});
});

describe("ownership", () => {
	it("does not let another user rename or archive a category", async () => {
		const pets = await createCategory(alice.id, "Pets");
		await expect(renameCategory(bob.id, pets.id, "Hijacked")).rejects.toThrow(
			"not found",
		);
		await expect(setCategoryArchived(bob.id, pets.id, true)).rejects.toThrow(
			"not found",
		);
		const row = await prisma.category.findUniqueOrThrow({
			where: { id: pets.id },
		});
		expect(row).toMatchObject({ name: "Pets", archivedAt: null });
	});
});

describe("archiving", () => {
	it("hides archived categories by default and restores them", async () => {
		const pets = await createCategory(alice.id, "Pets");
		await setCategoryArchived(alice.id, pets.id, true);
		expect(names(await listCategories(alice.id))).not.toContain("Pets");
		expect(
			names(await listCategories(alice.id, { includeArchived: true })),
		).toContain("Pets");
		await setCategoryArchived(alice.id, pets.id, false);
		expect(names(await listCategories(alice.id))).toContain("Pets");
	});
});

describe("database and schema guards", () => {
	it("rejects blank names even if validation is bypassed", async () => {
		await expect(
			prisma.category.create({ data: { userId: alice.id, name: "   " } }),
		).rejects.toThrow();
	});
	it("validates names", () => {
		expect(createCategorySchema.parse({ name: "  Eating   out " }).name).toBe(
			"Eating out",
		);
		expect(createCategorySchema.safeParse({ name: "   " }).success).toBe(false);
		expect(
			createCategorySchema.safeParse({ name: "x".repeat(41) }).success,
		).toBe(false);
		expect(
			renameCategorySchema.safeParse({ id: "nope", name: "ok" }).success,
		).toBe(false);
	});
});
