import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "#/db";
import { createPaymentMethod } from "#/features/payment-methods/payment-methods.service.server";
import { createSubscription } from "#/features/subscriptions/subscriptions.service.server";
import {
	cardData,
	createTestUser,
	deleteTestUsers,
	subscriptionData,
} from "#/test/helpers";

import {
	type TransactionData,
	transactionFiltersSchema,
	transactionInputSchema,
} from "./transactions.schemas";
import {
	createTransaction,
	deleteTransaction,
	getTransaction,
	listTransactions,
	updateTransaction,
} from "./transactions.service.server";

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
	const where = { userId: { in: [alice.id, bob.id] } };
	await prisma.transaction.deleteMany({ where });
	await prisma.subscription.deleteMany({ where });
	await prisma.paymentMethod.deleteMany({ where });
	await prisma.category.deleteMany({ where });
});

function tx(overrides: Partial<TransactionData> = {}): TransactionData {
	return {
		description: "Lunch",
		amountMinor: 100_000,
		currency: "NPR",
		occurredOn: "2025-03-10",
		categoryId: null,
		paymentMethodId: null,
		subscriptionId: null,
		refundOfId: null,
		notes: null,
		...overrides,
	};
}
const category = (userId: string, name = "Food") =>
	prisma.category.create({ data: { userId, name } });
const noFilters = transactionFiltersSchema.parse({});
const list = (userId: string, filters: object = {}) =>
	listTransactions(userId, transactionFiltersSchema.parse(filters));

describe("creating expenses", () => {
	it("stores the expense and returns it with readable links", async () => {
		const food = await category(alice.id);
		const card = await createPaymentMethod(
			alice.id,
			cardData({ name: "Daily card" }),
		);
		const created = await createTransaction(
			alice.id,
			tx({ categoryId: food.id, paymentMethodId: card.id, notes: "with team" }),
		);
		const view = await getTransaction(alice.id, created.id);
		expect(view).toMatchObject({
			type: "EXPENSE",
			amountMinor: 100_000,
			currency: "NPR",
			occurredOn: "2025-03-10",
			notes: "with team",
			category: { name: "Food" },
			paymentMethod: { name: "Daily card" },
			refunds: [],
			refundedMinor: 0,
			refundableMinor: 100_000,
		});
	});

	it("can link a real charge to a subscription without touching the subscription", async () => {
		const sub = await createSubscription(
			alice.id,
			subscriptionData({ name: "Streaming" }),
		);
		const created = await createTransaction(
			alice.id,
			tx({ subscriptionId: sub.id }),
		);
		expect(
			(await getTransaction(alice.id, created.id))?.subscription?.name,
		).toBe("Streaming");
		const after = await prisma.subscription.findUniqueOrThrow({
			where: { id: sub.id },
		});
		expect(after.status).toBe("ACTIVE");
	});
});

describe("ownership", () => {
	it("blocks other users from reading, editing or deleting", async () => {
		const mine = await createTransaction(
			alice.id,
			tx({ description: "Private" }),
		);
		expect(await getTransaction(bob.id, mine.id)).toBeNull();
		expect((await list(bob.id)).items).toEqual([]);
		await expect(
			updateTransaction(bob.id, mine.id, tx({ description: "Hijack" })),
		).rejects.toThrow("not found");
		await expect(deleteTransaction(bob.id, mine.id)).rejects.toThrow(
			"not found",
		);
		expect((await getTransaction(alice.id, mine.id))?.description).toBe(
			"Private",
		);
	});

	it("rejects another user's category, card, subscription or expense", async () => {
		const theirCategory = await category(bob.id);
		const theirCard = await createPaymentMethod(bob.id, cardData());
		const theirSub = await createSubscription(bob.id, subscriptionData());
		const theirExpense = await createTransaction(bob.id, tx());

		await expect(
			createTransaction(alice.id, tx({ categoryId: theirCategory.id })),
		).rejects.toThrow("Category not found");
		await expect(
			createTransaction(alice.id, tx({ paymentMethodId: theirCard.id })),
		).rejects.toThrow("Payment method not found");
		await expect(
			createTransaction(alice.id, tx({ subscriptionId: theirSub.id })),
		).rejects.toThrow("Subscription not found");
		await expect(
			createTransaction(alice.id, tx({ refundOfId: theirExpense.id })),
		).rejects.toThrow("Original expense not found");

		const mine = await createTransaction(alice.id, tx());
		await expect(
			updateTransaction(
				alice.id,
				mine.id,
				tx({ categoryId: theirCategory.id }),
			),
		).rejects.toThrow("Category not found");
		expect(
			await prisma.transaction.count({ where: { userId: alice.id } }),
		).toBe(1);
	});

	it("keeps an archived category on history but blocks new links to it", async () => {
		const food = await category(alice.id);
		const created = await createTransaction(
			alice.id,
			tx({ categoryId: food.id }),
		);
		await prisma.category.update({
			where: { id: food.id },
			data: { archivedAt: new Date() },
		});

		expect((await getTransaction(alice.id, created.id))?.category?.name).toBe(
			"Food",
		);
		await expect(
			updateTransaction(
				alice.id,
				created.id,
				tx({ categoryId: food.id, description: "Edited" }),
			),
		).resolves.toBeUndefined();
		await expect(
			createTransaction(alice.id, tx({ categoryId: food.id })),
		).rejects.toThrow("Category not found");
	});
});

describe("refunds", () => {
	const refundOf = (id: string, over: Partial<TransactionData> = {}) =>
		tx({ refundOfId: id, description: "Refund", amountMinor: 40_000, ...over });

	it("records a refund against the expense and tracks what is left", async () => {
		const expense = await createTransaction(alice.id, tx());
		const refund = await createTransaction(alice.id, refundOf(expense.id));
		const view = await getTransaction(alice.id, expense.id);
		expect(view).toMatchObject({
			refundedMinor: 40_000,
			refundableMinor: 60_000,
		});
		expect(view?.refunds.map((r) => r.id)).toEqual([refund.id]);
		const refundView = await getTransaction(alice.id, refund.id);
		expect(refundView).toMatchObject({
			type: "REFUND",
			original: { id: expense.id, amountMinor: 100_000 },
		});
	});

	it("caps cumulative refunds at the original amount", async () => {
		const expense = await createTransaction(alice.id, tx());
		await createTransaction(alice.id, refundOf(expense.id));
		await createTransaction(
			alice.id,
			refundOf(expense.id, { amountMinor: 60_000 }),
		);
		await expect(
			createTransaction(alice.id, refundOf(expense.id, { amountMinor: 1 })),
		).rejects.toThrow("fully refunded");
	});

	it("rejects an over-refund with the remaining amount, and a currency mismatch", async () => {
		const expense = await createTransaction(alice.id, tx());
		await expect(
			createTransaction(
				alice.id,
				refundOf(expense.id, { amountMinor: 100_001 }),
			),
		).rejects.toThrow("NPR 1,000.00");
		await expect(
			createTransaction(alice.id, refundOf(expense.id, { currency: "USD" })),
		).rejects.toThrow("same currency");
	});

	it("does not allow refunding a refund", async () => {
		const expense = await createTransaction(alice.id, tx());
		const refund = await createTransaction(alice.id, refundOf(expense.id));
		await expect(
			createTransaction(alice.id, refundOf(refund.id, { amountMinor: 10 })),
		).rejects.toThrow("Original expense not found");
	});

	it("never lets simultaneous refunds exceed the original", async () => {
		const expense = await createTransaction(alice.id, tx()); // 100,000
		const results = await Promise.allSettled([
			createTransaction(alice.id, refundOf(expense.id)),
			createTransaction(alice.id, refundOf(expense.id)),
			createTransaction(alice.id, refundOf(expense.id)),
			createTransaction(alice.id, refundOf(expense.id)),
		]); // four refunds of 40,000: only two fit
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
		const view = await getTransaction(alice.id, expense.id);
		expect(view?.refundedMinor).toBe(80_000);
	});

	it("cannot be linked to a subscription (schema)", () => {
		const parsed = transactionInputSchema.safeParse({
			description: "x",
			amount: "1",
			currency: "NPR",
			occurredOn: "2025-03-10",
			categoryId: "",
			paymentMethodId: "",
			notes: "",
			subscriptionId: "11111111-1111-4111-8111-111111111111",
			refundOfId: "22222222-2222-4222-8222-222222222222",
		});
		expect(parsed.success).toBe(false);
	});
});

describe("editing", () => {
	it("cannot change a transaction's type", async () => {
		const expense = await createTransaction(alice.id, tx());
		const other = await createTransaction(alice.id, tx());
		const refund = await createTransaction(
			alice.id,
			tx({ refundOfId: expense.id, amountMinor: 10 }),
		);
		await expect(
			updateTransaction(alice.id, expense.id, tx({ refundOfId: other.id })),
		).rejects.toThrow("type");
		await expect(
			updateTransaction(alice.id, refund.id, tx({ refundOfId: null })),
		).rejects.toThrow("type");
		await expect(
			updateTransaction(
				alice.id,
				refund.id,
				tx({ refundOfId: other.id, amountMinor: 10 }),
			),
		).rejects.toThrow("type");
	});

	it("protects an expense that has refunds", async () => {
		const expense = await createTransaction(alice.id, tx());
		await createTransaction(
			alice.id,
			tx({ refundOfId: expense.id, amountMinor: 40_000 }),
		);
		await expect(
			updateTransaction(alice.id, expense.id, tx({ amountMinor: 39_999 })),
		).rejects.toThrow("already refunded");
		await expect(
			updateTransaction(alice.id, expense.id, tx({ currency: "USD" })),
		).rejects.toThrow("currency");
		await expect(
			updateTransaction(
				alice.id,
				expense.id,
				tx({ amountMinor: 40_000, description: "Smaller" }),
			),
		).resolves.toBeUndefined();
	});

	it("re-checks the cap when a refund is edited, excluding itself", async () => {
		const expense = await createTransaction(alice.id, tx());
		const first = await createTransaction(
			alice.id,
			tx({ refundOfId: expense.id, amountMinor: 40_000 }),
		);
		await createTransaction(
			alice.id,
			tx({ refundOfId: expense.id, amountMinor: 50_000 }),
		);
		await expect(
			updateTransaction(
				alice.id,
				first.id,
				tx({ refundOfId: expense.id, amountMinor: 50_001 }),
			),
		).rejects.toThrow("NPR 500.00");
		await expect(
			updateTransaction(
				alice.id,
				first.id,
				tx({ refundOfId: expense.id, amountMinor: 50_000 }),
			),
		).resolves.toBeUndefined();
	});
});

describe("deleting", () => {
	it("blocks deleting an expense that still has refunds", async () => {
		const expense = await createTransaction(alice.id, tx());
		const refund = await createTransaction(
			alice.id,
			tx({ refundOfId: expense.id, amountMinor: 10 }),
		);
		await expect(deleteTransaction(alice.id, expense.id)).rejects.toThrow(
			"refunds first",
		);
		await deleteTransaction(alice.id, refund.id);
		await expect(
			deleteTransaction(alice.id, expense.id),
		).resolves.toBeUndefined();
		expect(await getTransaction(alice.id, expense.id)).toBeNull();
	});

	it("frees refund capacity when a refund is deleted", async () => {
		const expense = await createTransaction(alice.id, tx());
		const refund = await createTransaction(
			alice.id,
			tx({ refundOfId: expense.id, amountMinor: 100_000 }),
		);
		await deleteTransaction(alice.id, refund.id);
		await expect(
			createTransaction(
				alice.id,
				tx({ refundOfId: expense.id, amountMinor: 100_000 }),
			),
		).resolves.toBeDefined();
	});
});

describe("listing and filters", () => {
	it("filters by date range (inclusive), card, category and type, including 'none'", async () => {
		const food = await category(alice.id);
		const card = await createPaymentMethod(alice.id, cardData());
		const a = await createTransaction(
			alice.id,
			tx({
				description: "a",
				occurredOn: "2025-03-01",
				categoryId: food.id,
				paymentMethodId: card.id,
			}),
		);
		const b = await createTransaction(
			alice.id,
			tx({ description: "b", occurredOn: "2025-03-15" }),
		);
		const c = await createTransaction(
			alice.id,
			tx({ description: "c", occurredOn: "2025-04-01", categoryId: food.id }),
		);
		const r = await createTransaction(
			alice.id,
			tx({
				description: "r",
				occurredOn: "2025-03-20",
				refundOfId: a.id,
				amountMinor: 5_000,
			}),
		);
		const ids = async (f: object) =>
			(await list(alice.id, f)).items.map((i) => i.id).sort();
		const sorted = (...x: { id: string }[]) => x.map((i) => i.id).sort();

		expect(await ids({})).toEqual(sorted(a, b, c, r));
		expect(await ids({ from: "2025-03-15", to: "2025-03-20" })).toEqual(
			sorted(b, r),
		);
		expect(await ids({ from: "2025-03-16" })).toEqual(sorted(r, c));
		expect(await ids({ to: "2025-03-01" })).toEqual(sorted(a));
		expect(await ids({ cardId: card.id })).toEqual(sorted(a));
		expect(await ids({ cardId: "none" })).toEqual(sorted(b, c, r));
		expect(await ids({ categoryId: food.id })).toEqual(sorted(a, c));
		expect(await ids({ categoryId: "none" })).toEqual(sorted(b, r));
		expect(await ids({ type: "REFUND" })).toEqual(sorted(r));
		expect(
			await ids({ type: "EXPENSE", categoryId: food.id, from: "2025-03-02" }),
		).toEqual(sorted(c));
	});

	it("never shows or counts another user's data", async () => {
		await createTransaction(alice.id, tx({ description: "mine" }));
		await createTransaction(
			bob.id,
			tx({ description: "theirs", amountMinor: 999_999 }),
		);
		const result = await list(alice.id);
		expect(result.total).toBe(1);
		expect(result.items.map((i) => i.description)).toEqual(["mine"]);
		expect(result.totals).toEqual([
			{
				currency: "NPR",
				spentMinor: 100_000,
				refundedMinor: 0,
				netMinor: 100_000,
			},
		]);
	});

	it("totals the whole filtered set per currency, not just the visible page", async () => {
		for (let i = 0; i < 30; i++) {
			await createTransaction(
				alice.id,
				tx({ description: `n${i}`, amountMinor: 1_000 }),
			);
		}
		await createTransaction(
			alice.id,
			tx({ description: "usd", currency: "USD", amountMinor: 2_500 }),
		);
		const expense = await createTransaction(
			alice.id,
			tx({ description: "big", amountMinor: 50_000 }),
		);
		await createTransaction(
			alice.id,
			tx({ refundOfId: expense.id, amountMinor: 20_000 }),
		);

		const page1 = await list(alice.id);
		expect(page1.items).toHaveLength(25);
		expect(page1.total).toBe(33);
		expect(page1.pageCount).toBe(2);
		expect(page1.totals).toEqual([
			{
				currency: "NPR",
				spentMinor: 30 * 1_000 + 50_000,
				refundedMinor: 20_000,
				netMinor: 60_000,
			},
			{ currency: "USD", spentMinor: 2_500, refundedMinor: 0, netMinor: 2_500 },
		]);
	});

	it("pages without overlap or gaps, even when many rows share a date", async () => {
		const created: string[] = [];
		for (let i = 0; i < 30; i++) {
			created.push(
				(
					await createTransaction(
						alice.id,
						tx({ description: `same-day ${i}`, occurredOn: "2025-05-05" }),
					)
				).id,
			);
		}
		const p1 = await list(alice.id, { page: 1 });
		const p2 = await list(alice.id, { page: 2 });
		const seen = [...p1.items, ...p2.items].map((i) => i.id);
		expect(seen).toHaveLength(30);
		expect(new Set(seen).size).toBe(30);
		expect([...seen].sort()).toEqual([...created].sort());
		// Repeating the query yields the same order.
		expect((await list(alice.id, { page: 1 })).items.map((i) => i.id)).toEqual(
			p1.items.map((i) => i.id),
		);
	});

	it("orders newest first and clamps a page beyond the end", async () => {
		await createTransaction(
			alice.id,
			tx({ description: "old", occurredOn: "2025-01-01" }),
		);
		await createTransaction(
			alice.id,
			tx({ description: "new", occurredOn: "2025-06-01" }),
		);
		const result = await list(alice.id, { page: 9 });
		expect(result.page).toBe(1);
		expect(result.items.map((i) => i.description)).toEqual(["new", "old"]);
	});
});

describe("database guards", () => {
	const base = (userId: string) => ({
		userId,
		amountMinor: 100,
		currency: "NPR",
		occurredOn: new Date("2025-03-10"),
		description: "x",
	});

	it("rejects bad rows even if validation is bypassed", async () => {
		const expense = await prisma.transaction.create({
			data: { ...base(alice.id), type: "EXPENSE" },
		});
		await expect(
			prisma.transaction.create({
				data: { ...base(alice.id), type: "EXPENSE", amountMinor: 0 },
			}),
		).rejects.toThrow();
		await expect(
			prisma.transaction.create({
				data: { ...base(alice.id), type: "EXPENSE", currency: "npr" },
			}),
		).rejects.toThrow();
		await expect(
			prisma.transaction.create({
				data: { ...base(alice.id), type: "EXPENSE", description: "  " },
			}),
		).rejects.toThrow();
		await expect(
			prisma.transaction.create({
				data: { ...base(alice.id), type: "REFUND" },
			}),
		).rejects.toThrow(); // refund without original
		await expect(
			prisma.transaction.create({
				data: { ...base(alice.id), type: "EXPENSE", refundOfId: expense.id },
			}),
		).rejects.toThrow(); // expense with original
		const refund = await prisma.transaction.create({
			data: { ...base(alice.id), type: "REFUND", refundOfId: expense.id },
		});
		await expect(
			prisma.$executeRawUnsafe(
				`update "transaction" set "refundOfId" = id where id = '${refund.id}'::uuid`,
			),
		).rejects.toThrow();
	});

	it("cascades cleanly when a user is deleted", async () => {
		const carol = await createTestUser();
		const food = await category(carol.id);
		const card = await createPaymentMethod(carol.id, cardData());
		const sub = await createSubscription(
			carol.id,
			subscriptionData({ paymentMethodId: card.id }),
		);
		const expense = await createTransaction(
			carol.id,
			tx({
				categoryId: food.id,
				paymentMethodId: card.id,
				subscriptionId: sub.id,
			}),
		);
		await createTransaction(
			carol.id,
			tx({ refundOfId: expense.id, amountMinor: 10 }),
		);

		// Blocked individually...
		await expect(
			prisma.category.delete({ where: { id: food.id } }),
		).rejects.toThrow();
		await expect(
			prisma.transaction.delete({ where: { id: expense.id } }),
		).rejects.toThrow();
		// ...but removing the user removes everything.
		await prisma.user.delete({ where: { id: carol.id } });
		for (const model of [
			prisma.transaction,
			prisma.category,
			prisma.subscription,
			prisma.paymentMethod,
		] as const) {
			expect(
				await (
					model as unknown as { count: (a: object) => Promise<number> }
				).count({ where: { userId: carol.id } }),
			).toBe(0);
		}
	});
});

describe("input schemas", () => {
	const valid = {
		description: " Lunch ",
		amount: "1,250.50",
		currency: "NPR",
		occurredOn: "2025-03-10",
		categoryId: "",
		paymentMethodId: "",
		subscriptionId: "",
		refundOfId: "",
		notes: "",
	};

	it("normalises the form", () => {
		expect(transactionInputSchema.parse(valid)).toMatchObject({
			description: "Lunch",
			amountMinor: 125_050,
			categoryId: null,
			refundOfId: null,
			notes: null,
		});
	});

	it.each([
		["a zero amount", { amount: "0" }],
		["too many decimals", { amount: "1.234" }],
		["a bad date", { occurredOn: "2025-02-30" }],
		["a blank description", { description: "   " }],
		["a long description", { description: "x".repeat(121) }],
		["a non-uuid category", { categoryId: "abc" }],
		["an unsupported currency", { currency: "XXX" }],
	])("rejects %s", (_label, patch) => {
		expect(
			transactionInputSchema.safeParse({ ...valid, ...patch }).success,
		).toBe(false);
	});

	it("filters tolerate garbage from the URL and swap a reversed range", () => {
		expect(noFilters).toEqual({});
		const f = transactionFiltersSchema.parse({
			from: "nope",
			cardId: "xyz",
			type: "BOGUS",
			page: -3,
		});
		expect(f).toEqual({});
		expect(
			transactionFiltersSchema.parse({ from: "2025-05-10", to: "2025-05-01" }),
		).toMatchObject({ from: "2025-05-01", to: "2025-05-10" });
	});
});
