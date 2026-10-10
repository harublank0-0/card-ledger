import { prisma } from "#/db";

/**
 * How much data an account holds, for the delete-account confirmation. Counts only; every
 * query is scoped by `userId`.
 */
export async function getAccountSummary(userId: string) {
	const [
		cards,
		subscriptions,
		transactions,
		statements,
		statementPayments,
		categories,
	] = await Promise.all([
		prisma.paymentMethod.count({ where: { userId } }),
		prisma.subscription.count({ where: { userId } }),
		prisma.transaction.count({ where: { userId } }),
		prisma.cardStatement.count({ where: { userId } }),
		prisma.statementPayment.count({ where: { userId } }),
		prisma.category.count({ where: { userId } }),
	]);
	return {
		cards,
		subscriptions,
		transactions,
		statements,
		statementPayments,
		categories,
	};
}
