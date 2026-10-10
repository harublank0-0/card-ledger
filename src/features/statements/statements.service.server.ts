import { prisma } from "#/db";
import type { Prisma } from "#/generated/prisma/client.js";
import type { CalendarDate } from "#/lib/calendar-date";
import { lockCard } from "#/lib/card-lock.server";
import { fromDbDate, toDbDate } from "#/lib/db-dates";
import {
	outstandingByCurrency,
	periodsOverlap,
	type StatementStatus,
	statementStatus,
	suggestNextStatement,
} from "./statements.logic";
import type { PaymentData, StatementData } from "./statements.schemas";

/** Every function takes `userId` first and scopes every query by it. */

export type StatementView = {
	id: string;
	paymentMethodId: string;
	card: { id: string; name: string; last4: string; archived: boolean };
	periodStart: CalendarDate;
	periodEnd: CalendarDate;
	dueDate: CalendarDate;
	currency: string;
	balanceMinor: number;
	minimumDueMinor: number | null;
	paidMinor: number;
	outstandingMinor: number;
	/** Paid beyond the balance (credit). */
	overpaidMinor: number;
	status: StatementStatus;
	/** Negative once the due date has passed. */
	daysUntilDue: number;
};

export type StatementDetail = StatementView & {
	payments: {
		id: string;
		amountMinor: number;
		paidOn: CalendarDate;
		notes: string | null;
	}[];
};

const viewInclude = {
	paymentMethod: {
		select: { id: true, name: true, last4: true, archivedAt: true },
	},
	payments: {
		select: { id: true, amountMinor: true, paidOn: true, notes: true },
		orderBy: [{ paidOn: "desc" }, { id: "desc" }],
	},
} satisfies Prisma.CardStatementInclude;

type Row = Prisma.CardStatementGetPayload<{ include: typeof viewInclude }>;

function toDetail(row: Row, today: CalendarDate): StatementDetail {
	const paidMinor = row.payments.reduce((sum, p) => sum + p.amountMinor, 0);
	const derived = statementStatus({
		balanceMinor: row.statementBalanceMinor,
		paidMinor,
		dueDate: fromDbDate(row.dueDate),
		today,
	});
	return {
		id: row.id,
		paymentMethodId: row.paymentMethodId,
		card: {
			id: row.paymentMethod.id,
			name: row.paymentMethod.name,
			last4: row.paymentMethod.last4,
			archived: row.paymentMethod.archivedAt !== null,
		},
		periodStart: fromDbDate(row.periodStart),
		periodEnd: fromDbDate(row.periodEnd),
		dueDate: fromDbDate(row.dueDate),
		currency: row.currency,
		balanceMinor: row.statementBalanceMinor,
		minimumDueMinor: row.minimumDueMinor,
		paidMinor,
		outstandingMinor: derived.outstandingMinor,
		overpaidMinor: derived.overpaidMinor,
		status: derived.status,
		daysUntilDue: derived.daysUntilDue,
		payments: row.payments.map((p) => ({
			id: p.id,
			amountMinor: p.amountMinor,
			paidOn: fromDbDate(p.paidOn),
			notes: p.notes,
		})),
	};
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export async function listStatements(
	userId: string,
	options: { cardId?: string; includePaid: boolean; today: CalendarDate },
) {
	const rows = await prisma.cardStatement.findMany({
		where: {
			userId,
			...(options.cardId ? { paymentMethodId: options.cardId } : {}),
		},
		include: viewInclude,
	});
	const all = rows.map((row) => toDetail(row, options.today));

	// Unpaid first (soonest due first, overdue ones naturally lead), then paid newest first.
	const byDue = (a: StatementView, b: StatementView) =>
		a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id);
	const unpaid = all.filter((s) => s.status !== "PAID").sort(byDue);
	const paid = all
		.filter((s) => s.status === "PAID")
		.sort((a, b) => byDue(b, a));

	return {
		statements: options.includePaid ? [...unpaid, ...paid] : unpaid,
		outstanding: outstandingByCurrency(
			unpaid.map((s) => ({
				currency: s.currency,
				outstandingMinor: s.outstandingMinor,
			})),
		),
	};
}

export async function getStatement(
	userId: string,
	id: string,
	today: CalendarDate,
): Promise<StatementDetail | null> {
	const row = await prisma.cardStatement.findFirst({
		where: { id, userId },
		include: viewInclude,
	});
	return row ? toDetail(row, today) : null;
}

/** Starting values for the "add statement" form, from the card's statement and due days. */
export async function getStatementDefaults(
	userId: string,
	cardId: string,
	today: CalendarDate,
) {
	const card = await prisma.paymentMethod.findFirst({
		where: { id: cardId, userId, archivedAt: null },
	});
	// Null, not a throw: a missing (or someone else's) card is an ordinary answer, and a
	// route that treated every throw as "not found" would hide real failures.
	if (!card) return null;
	const latest = await prisma.cardStatement.findFirst({
		where: { userId, paymentMethodId: cardId },
		orderBy: { periodEnd: "desc" },
		select: { periodEnd: true },
	});
	return {
		card: {
			id: card.id,
			name: card.name,
			last4: card.last4,
			currency: card.currency,
		},
		suggestion: suggestNextStatement({
			card: {
				statementDay: card.statementDay,
				paymentDueDay: card.paymentDueDay,
			},
			previousPeriodEnd: latest ? fromDbDate(latest.periodEnd) : null,
			today,
		}),
	};
}

// ---------------------------------------------------------------------------
// Writing statements
// ---------------------------------------------------------------------------

type Tx = Prisma.TransactionClient;

async function assertNoOverlap(
	tx: Tx,
	userId: string,
	cardId: string,
	period: { start: CalendarDate; end: CalendarDate },
	exceptId?: string,
) {
	const others = await tx.cardStatement.findMany({
		where: {
			userId,
			paymentMethodId: cardId,
			...(exceptId ? { id: { not: exceptId } } : {}),
		},
		select: { periodStart: true, periodEnd: true },
	});
	const clash = others.find((o) =>
		periodsOverlap(period, {
			start: fromDbDate(o.periodStart),
			end: fromDbDate(o.periodEnd),
		}),
	);
	if (clash) {
		throw new Error(
			`This card already has a statement covering ${fromDbDate(clash.periodStart)} to ${fromDbDate(clash.periodEnd)}`,
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

export async function createStatement(userId: string, data: StatementData) {
	try {
		return await prisma.$transaction(async (tx) => {
			// The currency is read under the card's lock: a change that was in flight when the
			// request arrived has committed by now, and the statement follows it.
			const card = await lockCard(tx, userId, data.paymentMethodId);
			if (card.archivedAt) throw new Error("Payment method not found");
			if (card.currency !== data.currency) {
				throw new Error(
					`The statement must be in the card's currency (${card.currency})`,
				);
			}
			await assertNoOverlap(tx, userId, data.paymentMethodId, {
				start: data.periodStart,
				end: data.periodEnd,
			});
			return tx.cardStatement.create({
				data: {
					userId,
					paymentMethodId: data.paymentMethodId,
					currency: card.currency,
					periodStart: toDbDate(data.periodStart),
					periodEnd: toDbDate(data.periodEnd),
					dueDate: toDbDate(data.dueDate),
					statementBalanceMinor: data.statementBalanceMinor,
					minimumDueMinor: data.minimumDueMinor,
				},
				select: { id: true },
			});
		});
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw new Error("This card already has a statement for that period");
		}
		throw error;
	}
}

export async function updateStatement(
	userId: string,
	id: string,
	data: StatementData,
) {
	const existing = await prisma.cardStatement.findFirst({
		where: { id, userId },
	});
	if (!existing) throw new Error("Statement not found");
	if (data.paymentMethodId !== existing.paymentMethodId) {
		throw new Error("A statement's card cannot be changed");
	}
	if (data.currency !== existing.currency) {
		throw new Error(
			`The statement must be in the card's currency (${existing.currency})`,
		);
	}
	try {
		await prisma.$transaction(async (tx) => {
			await lockCard(tx, userId, existing.paymentMethodId);
			await assertNoOverlap(
				tx,
				userId,
				existing.paymentMethodId,
				{ start: data.periodStart, end: data.periodEnd },
				id,
			);
			const { count } = await tx.cardStatement.updateMany({
				where: { id, userId },
				data: {
					periodStart: toDbDate(data.periodStart),
					periodEnd: toDbDate(data.periodEnd),
					dueDate: toDbDate(data.dueDate),
					statementBalanceMinor: data.statementBalanceMinor,
					minimumDueMinor: data.minimumDueMinor,
				},
			});
			if (count === 0) throw new Error("Statement not found");
		});
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw new Error("This card already has a statement for that period");
		}
		throw error;
	}
}

/** Hard delete (entered by hand). Payments must be removed first so nothing is lost silently. */
export async function deleteStatement(userId: string, id: string) {
	await prisma.$transaction(async (tx) => {
		const existing = await tx.cardStatement.findFirst({
			where: { id, userId },
		});
		if (!existing) throw new Error("Statement not found");
		const payments = await tx.statementPayment.count({
			where: { statementId: id, userId },
		});
		if (payments > 0) throw new Error("Delete this statement's payments first");
		await tx.cardStatement.deleteMany({ where: { id, userId } });
	});
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

/**
 * Record a payment toward a statement. Overpaying is allowed; the excess is shown as credit.
 * A payment is not an expense and never creates a transaction.
 */
export async function addPayment(userId: string, data: PaymentData) {
	const statement = await prisma.cardStatement.findFirst({
		where: { id: data.statementId, userId },
		select: { id: true, currency: true },
	});
	if (!statement) throw new Error("Statement not found");
	if (statement.currency !== data.currency) {
		throw new Error(
			`The payment must be in the statement's currency (${statement.currency})`,
		);
	}
	return prisma.statementPayment.create({
		data: {
			userId,
			statementId: statement.id,
			amountMinor: data.amountMinor,
			paidOn: toDbDate(data.paidOn),
			notes: data.notes,
		},
		select: { id: true },
	});
}

export async function deletePayment(userId: string, id: string) {
	const { count } = await prisma.statementPayment.deleteMany({
		where: { id, userId },
	});
	if (count === 0) throw new Error("Payment not found");
}
