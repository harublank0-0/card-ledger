import { prisma } from "#/db";
import type { Prisma } from "#/generated/prisma/client.js";
import type { CalendarDate } from "#/lib/calendar-date";
import { fromDbDate, toDbDate } from "#/lib/db-dates";

import {
	netByCurrency,
	refundableRemaining,
	type TotalsRow,
	type TransactionType,
	validateExpenseEdit,
	validateRefund,
} from "./transactions.logic";
import {
	PAGE_SIZE,
	type TransactionData,
	type TransactionFilters,
} from "./transactions.schemas";

/** Every function takes `userId` first and scopes every query by it. */

export type TransactionView = {
	id: string;
	type: TransactionType;
	amountMinor: number;
	currency: string;
	occurredOn: CalendarDate;
	description: string;
	notes: string | null;
	categoryId: string | null;
	paymentMethodId: string | null;
	subscriptionId: string | null;
	refundOfId: string | null;
	category: { id: string; name: string } | null;
	paymentMethod: { id: string; name: string; last4: string } | null;
	subscription: { id: string; name: string } | null;
};

const viewInclude = {
	category: { select: { id: true, name: true } },
	paymentMethod: { select: { id: true, name: true, last4: true } },
	subscription: { select: { id: true, name: true } },
} satisfies Prisma.TransactionInclude;

type Row = Prisma.TransactionGetPayload<{ include: typeof viewInclude }>;

function toView(row: Row): TransactionView {
	return {
		id: row.id,
		type: row.type,
		amountMinor: row.amountMinor,
		currency: row.currency,
		occurredOn: fromDbDate(row.occurredOn),
		description: row.description,
		notes: row.notes,
		categoryId: row.categoryId,
		paymentMethodId: row.paymentMethodId,
		subscriptionId: row.subscriptionId,
		refundOfId: row.refundOfId,
		category: row.category,
		paymentMethod: row.paymentMethod,
		subscription: row.subscription,
	};
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

function buildWhere(
	userId: string,
	f: TransactionFilters,
): Prisma.TransactionWhereInput {
	return {
		userId,
		...(f.from || f.to
			? {
					occurredOn: {
						...(f.from ? { gte: toDbDate(f.from) } : {}),
						...(f.to ? { lte: toDbDate(f.to) } : {}),
					},
				}
			: {}),
		...(f.cardId
			? { paymentMethodId: f.cardId === "none" ? null : f.cardId }
			: {}),
		...(f.categoryId
			? { categoryId: f.categoryId === "none" ? null : f.categoryId }
			: {}),
		...(f.type ? { type: f.type } : {}),
	};
}

export async function listTransactions(
	userId: string,
	filters: TransactionFilters,
) {
	const where = buildWhere(userId, filters);
	const [total, groups] = await Promise.all([
		prisma.transaction.count({ where }),
		prisma.transaction.groupBy({
			by: ["currency", "type"],
			where,
			_sum: { amountMinor: true },
		}),
	]);
	const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const page = Math.min(filters.page ?? 1, pageCount);

	const rows = await prisma.transaction.findMany({
		where,
		include: viewInclude,
		// `id` breaks ties between same-day rows so pages never overlap or skip.
		orderBy: [{ occurredOn: "desc" }, { id: "desc" }],
		skip: (page - 1) * PAGE_SIZE,
		take: PAGE_SIZE,
	});

	const totalsRows: TotalsRow[] = groups.map((g) => ({
		currency: g.currency,
		type: g.type,
		sumMinor: g._sum.amountMinor ?? 0,
	}));
	return {
		items: rows.map(toView),
		total,
		page,
		pageCount,
		pageSize: PAGE_SIZE,
		totals: netByCurrency(totalsRows),
	};
}

// ---------------------------------------------------------------------------
// Reading one
// ---------------------------------------------------------------------------

export type TransactionDetail = TransactionView & {
	/** Expenses: refunds recorded against it. */
	refunds: {
		id: string;
		amountMinor: number;
		occurredOn: CalendarDate;
		description: string;
	}[];
	refundedMinor: number;
	refundableMinor: number;
	/** Refunds: the expense being refunded. */
	original: {
		id: string;
		description: string;
		amountMinor: number;
		currency: string;
	} | null;
};

export async function getTransaction(
	userId: string,
	id: string,
): Promise<TransactionDetail | null> {
	const row = await prisma.transaction.findFirst({
		where: { id, userId },
		include: {
			...viewInclude,
			refundOf: {
				select: {
					id: true,
					description: true,
					amountMinor: true,
					currency: true,
				},
			},
			refunds: {
				where: { userId },
				select: {
					id: true,
					amountMinor: true,
					occurredOn: true,
					description: true,
				},
				orderBy: [{ occurredOn: "desc" }, { id: "desc" }],
			},
		},
	});
	if (!row) return null;
	const refunds = row.refunds.map((r) => ({
		id: r.id,
		amountMinor: r.amountMinor,
		occurredOn: fromDbDate(r.occurredOn),
		description: r.description,
	}));
	const refundedMinor = refunds.reduce((sum, r) => sum + r.amountMinor, 0);
	return {
		...toView(row),
		refunds,
		refundedMinor,
		refundableMinor: refundableRemaining(row, refundedMinor),
		original: row.refundOf,
	};
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

type Refs = Pick<
	TransactionData,
	"categoryId" | "paymentMethodId" | "subscriptionId"
>;

/**
 * Linked category / card / subscription must belong to the caller and be active, unless the
 * transaction already links to it (so editing an old transaction keeps working).
 */
async function assertRefsUsable(
	userId: string,
	refs: Refs,
	current: Partial<Refs> = {},
) {
	const usable = { userId, archivedAt: null };
	if (refs.categoryId && refs.categoryId !== current.categoryId) {
		const found = await prisma.category.findFirst({
			where: { id: refs.categoryId, ...usable },
			select: { id: true },
		});
		if (!found) throw new Error("Category not found");
	}
	if (
		refs.paymentMethodId &&
		refs.paymentMethodId !== current.paymentMethodId
	) {
		const found = await prisma.paymentMethod.findFirst({
			where: { id: refs.paymentMethodId, ...usable },
			select: { id: true },
		});
		if (!found) throw new Error("Payment method not found");
	}
	if (refs.subscriptionId && refs.subscriptionId !== current.subscriptionId) {
		const found = await prisma.subscription.findFirst({
			where: { id: refs.subscriptionId, ...usable },
			select: { id: true },
		});
		if (!found) throw new Error("Subscription not found");
	}
}

type Tx = Prisma.TransactionClient;

/** Serialise everything that touches one expense (refund create/edit, expense edit/delete). */
async function lockExpense(tx: Tx, userId: string, id: string) {
	const rows = await tx.$queryRaw<{ id: string }[]>`
		SELECT id FROM "transaction"
		WHERE id = ${id}::uuid AND "userId" = ${userId} AND type = 'EXPENSE'
		FOR UPDATE`;
	if (rows.length === 0) throw new Error("Original expense not found");
}

async function refundedTotal(
	tx: Tx,
	userId: string,
	expenseId: string,
	exceptId?: string,
) {
	const agg = await tx.transaction.aggregate({
		where: {
			userId,
			refundOfId: expenseId,
			...(exceptId ? { id: { not: exceptId } } : {}),
		},
		_sum: { amountMinor: true },
	});
	return agg._sum.amountMinor ?? 0;
}

function rowData(data: TransactionData) {
	return {
		amountMinor: data.amountMinor,
		currency: data.currency,
		occurredOn: toDbDate(data.occurredOn),
		description: data.description,
		notes: data.notes,
		categoryId: data.categoryId,
		paymentMethodId: data.paymentMethodId,
		subscriptionId: data.subscriptionId,
	};
}

export async function createTransaction(userId: string, data: TransactionData) {
	await assertRefsUsable(userId, data);

	if (!data.refundOfId) {
		return prisma.transaction.create({
			data: { ...rowData(data), userId, type: "EXPENSE" },
			select: { id: true },
		});
	}

	const originalId = data.refundOfId;
	return prisma.$transaction(async (tx) => {
		await lockExpense(tx, userId, originalId);
		const original = await tx.transaction.findFirstOrThrow({
			where: { id: originalId, userId },
		});
		const problem = validateRefund({
			original,
			alreadyRefundedMinor: await refundedTotal(tx, userId, originalId),
			amountMinor: data.amountMinor,
			currency: data.currency,
		});
		if (problem) throw new Error(problem);
		return tx.transaction.create({
			data: {
				...rowData(data),
				userId,
				type: "REFUND",
				refundOfId: originalId,
			},
			select: { id: true },
		});
	});
}

export async function updateTransaction(
	userId: string,
	id: string,
	data: TransactionData,
) {
	const existing = await prisma.transaction.findFirst({
		where: { id, userId },
	});
	if (!existing) throw new Error("Transaction not found");
	if ((data.refundOfId ?? null) !== existing.refundOfId) {
		throw new Error("The type of a transaction cannot be changed");
	}
	await assertRefsUsable(userId, data, existing);

	await prisma.$transaction(async (tx) => {
		if (existing.type === "REFUND" && existing.refundOfId) {
			await lockExpense(tx, userId, existing.refundOfId);
			const original = await tx.transaction.findFirstOrThrow({
				where: { id: existing.refundOfId, userId },
			});
			const problem = validateRefund({
				original,
				alreadyRefundedMinor: await refundedTotal(tx, userId, original.id, id),
				amountMinor: data.amountMinor,
				currency: data.currency,
			});
			if (problem) throw new Error(problem);
		} else {
			await lockExpense(tx, userId, id);
			const problem = validateExpenseEdit({
				currentCurrency: existing.currency,
				newCurrency: data.currency,
				newAmountMinor: data.amountMinor,
				refundedMinor: await refundedTotal(tx, userId, id),
			});
			if (problem) throw new Error(problem);
		}
		const { count } = await tx.transaction.updateMany({
			where: { id, userId },
			data: rowData(data),
		});
		if (count === 0) throw new Error("Transaction not found");
	});
}

/** Hard delete (the user typed these in). An expense with refunds must lose its refunds first. */
export async function deleteTransaction(userId: string, id: string) {
	await prisma.$transaction(async (tx) => {
		const existing = await tx.transaction.findFirst({ where: { id, userId } });
		if (!existing) throw new Error("Transaction not found");
		if (existing.type === "EXPENSE") {
			await lockExpense(tx, userId, id);
			if ((await refundedTotal(tx, userId, id)) > 0) {
				throw new Error("Delete this expense's refunds first");
			}
		}
		await tx.transaction.deleteMany({ where: { id, userId } });
	});
}
