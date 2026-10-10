import type { Prisma } from "#/generated/prisma/client.js";

/**
 * Lock one card's row for the rest of the transaction and return what is true *now*.
 *
 * Statement writes and a change of the card's currency both go through here, so they are
 * serialised per card: two overlapping periods cannot both pass the overlap check, and a
 * statement cannot be created in a currency the card has just stopped using. Anything that
 * depends on the card's current state must read it from the returned row, not from a read made
 * before the lock was taken.
 */
export async function lockCard(
	tx: Prisma.TransactionClient,
	userId: string,
	cardId: string,
) {
	const rows = await tx.$queryRaw<
		{ id: string; currency: string; archivedAt: Date | null }[]
	>`
		SELECT id, currency, "archivedAt" FROM payment_method
		WHERE id = ${cardId}::uuid AND "userId" = ${userId}
		FOR UPDATE`;
	const card = rows[0];
	if (!card) throw new Error("Payment method not found");
	return card;
}
