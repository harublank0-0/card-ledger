import { prisma } from "#/db";
import { lockCard } from "#/lib/card-lock.server";
import type { PaymentMethodData } from "./payment-methods.schemas";

/**
 * Every function takes `userId` first and scopes every query by it. Never look a record up by
 * id alone: ids come from the client and must belong to the caller.
 */

export function listPaymentMethods(
	userId: string,
	options: { includeArchived?: boolean } = {},
) {
	return prisma.paymentMethod.findMany({
		where: {
			userId,
			...(options.includeArchived ? {} : { archivedAt: null }),
		},
		orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { name: "asc" }],
	});
}

export function getPaymentMethod(userId: string, id: string) {
	return prisma.paymentMethod.findFirst({ where: { id, userId } });
}

export function createPaymentMethod(userId: string, data: PaymentMethodData) {
	return prisma.paymentMethod.create({ data: { ...data, userId } });
}

export async function updatePaymentMethod(
	userId: string,
	id: string,
	data: PaymentMethodData,
) {
	await prisma.$transaction(async (tx) => {
		// Under the card's lock, so a statement being written right now is either already
		// counted below or waits for this change and is then checked against the new currency.
		const existing = await lockCard(tx, userId, id);
		// Statements are in the card's currency, so it cannot change once any exist.
		if (data.currency !== existing.currency) {
			const statements = await tx.cardStatement.count({
				where: { userId, paymentMethodId: id },
			});
			if (statements > 0) {
				throw new Error(
					"The currency cannot change while this card has statements",
				);
			}
		}
		await tx.paymentMethod.updateMany({ where: { id, userId }, data });
	});
	return getPaymentMethod(userId, id);
}

/** Archive instead of delete so historical subscriptions keep their reference. */
export async function setPaymentMethodArchived(
	userId: string,
	id: string,
	archived: boolean,
) {
	const { count } = await prisma.paymentMethod.updateMany({
		where: { id, userId },
		data: { archivedAt: archived ? new Date() : null },
	});
	if (count === 0) throw new Error("Payment method not found");
}
