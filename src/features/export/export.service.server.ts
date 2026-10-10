import { prisma } from "#/db";
import { outstandingMinor } from "#/features/statements/statements.logic";
import { fromDbDate } from "#/lib/db-dates";
import {
	type CurrencyCode,
	isSupportedCurrency,
	minorToInputString,
} from "#/lib/money";

import { EXPORT_FORMAT, EXPORT_VERSION } from "./export.logic";

/**
 * Everything the user owns, as plain data. Every query is scoped by `userId`.
 * Deliberately excluded: password hash, sessions, linked accounts, verification tokens and the
 * reminder delivery log (operational, not financial).
 */

/** Decimal string for humans and spreadsheets: 64900 NPR -> "649.00". */
function decimal(minor: number, currency: string) {
	return isSupportedCurrency(currency)
		? minorToInputString(minor, currency as CurrencyCode)
		: String(minor);
}

const iso = (date: Date) => date.toISOString();

export async function buildExport(userId: string, now: Date) {
	const [
		user,
		preference,
		categories,
		cards,
		subscriptions,
		transactions,
		statements,
	] = await Promise.all([
		prisma.user.findUniqueOrThrow({
			where: { id: userId },
			select: { name: true, email: true },
		}),
		prisma.notificationPreference.findUnique({ where: { userId } }),
		prisma.category.findMany({ where: { userId }, orderBy: { name: "asc" } }),
		prisma.paymentMethod.findMany({
			where: { userId },
			orderBy: { name: "asc" },
		}),
		prisma.subscription.findMany({
			where: { userId },
			orderBy: { name: "asc" },
		}),
		prisma.transaction.findMany({
			where: { userId },
			orderBy: [{ occurredOn: "asc" }, { id: "asc" }],
		}),
		prisma.cardStatement.findMany({
			where: { userId },
			include: { payments: { orderBy: [{ paidOn: "asc" }, { id: "asc" }] } },
			orderBy: [{ periodEnd: "asc" }, { id: "asc" }],
		}),
	]);

	const categoryName = new Map(categories.map((c) => [c.id, c.name]));
	const cardName = new Map(cards.map((c) => [c.id, c.name]));
	const subscriptionName = new Map(subscriptions.map((s) => [s.id, s.name]));
	const name = <T>(map: Map<string, T>, id: string | null) =>
		id === null ? null : (map.get(id) ?? null);

	const statementRows = statements.map((s) => {
		const paidMinor = s.payments.reduce((sum, p) => sum + p.amountMinor, 0);
		return {
			id: s.id,
			cardId: s.paymentMethodId,
			cardName: name(cardName, s.paymentMethodId),
			periodStart: fromDbDate(s.periodStart),
			periodEnd: fromDbDate(s.periodEnd),
			dueDate: fromDbDate(s.dueDate),
			currency: s.currency,
			balanceMinor: s.statementBalanceMinor,
			balance: decimal(s.statementBalanceMinor, s.currency),
			minimumDueMinor: s.minimumDueMinor,
			minimumDue:
				s.minimumDueMinor === null
					? null
					: decimal(s.minimumDueMinor, s.currency),
			// Derived from the payments below; included for convenience.
			paidMinor,
			outstandingMinor: outstandingMinor(s.statementBalanceMinor, paidMinor),
			createdAt: iso(s.createdAt),
		};
	});

	return {
		format: EXPORT_FORMAT,
		version: EXPORT_VERSION,
		exportedAt: iso(now),
		account: { name: user.name, email: user.email },
		settings: preference
			? {
					timezone: preference.timezone,
					emailEnabled: preference.emailEnabled,
					offsetsDays: preference.offsetsDays,
					renewalEnabled: preference.renewalEnabled,
					expiryEnabled: preference.expiryEnabled,
					cancellationEnabled: preference.cancellationEnabled,
					paymentDueEnabled: preference.paymentDueEnabled,
				}
			: null,
		categories: categories.map((c) => ({
			id: c.id,
			name: c.name,
			archived: c.archivedAt !== null,
			createdAt: iso(c.createdAt),
		})),
		cards: cards.map((c) => ({
			id: c.id,
			name: c.name,
			issuer: c.issuer,
			last4: c.last4,
			currency: c.currency,
			creditLimitMinor: c.creditLimitMinor,
			creditLimit:
				c.creditLimitMinor === null
					? null
					: decimal(c.creditLimitMinor, c.currency),
			statementDay: c.statementDay,
			paymentDueDay: c.paymentDueDay,
			archived: c.archivedAt !== null,
			createdAt: iso(c.createdAt),
		})),
		subscriptions: subscriptions.map((s) => ({
			id: s.id,
			name: s.name,
			amountMinor: s.amountMinor,
			currency: s.currency,
			amount: decimal(s.amountMinor, s.currency),
			intervalCount: s.intervalCount,
			intervalUnit: s.intervalUnit,
			anchorDate: fromDbDate(s.anchorDate),
			status: s.status,
			autoRenew: s.autoRenew,
			expiresOn: s.expiresOn ? fromDbDate(s.expiresOn) : null,
			cancellationDeadline: s.cancellationDeadline
				? fromDbDate(s.cancellationDeadline)
				: null,
			cancelledOn: s.cancelledOn ? fromDbDate(s.cancelledOn) : null,
			cardId: s.paymentMethodId,
			cardName: name(cardName, s.paymentMethodId),
			notes: s.notes,
			archived: s.archivedAt !== null,
			createdAt: iso(s.createdAt),
		})),
		transactions: transactions.map((t) => ({
			id: t.id,
			type: t.type,
			occurredOn: fromDbDate(t.occurredOn),
			description: t.description,
			amountMinor: t.amountMinor,
			currency: t.currency,
			amount: decimal(t.amountMinor, t.currency),
			categoryId: t.categoryId,
			categoryName: name(categoryName, t.categoryId),
			cardId: t.paymentMethodId,
			cardName: name(cardName, t.paymentMethodId),
			subscriptionId: t.subscriptionId,
			subscriptionName: name(subscriptionName, t.subscriptionId),
			refundOfId: t.refundOfId,
			notes: t.notes,
			createdAt: iso(t.createdAt),
		})),
		statements: statementRows,
		statementPayments: statements.flatMap((s) =>
			s.payments.map((p) => ({
				id: p.id,
				statementId: s.id,
				paidOn: fromDbDate(p.paidOn),
				amountMinor: p.amountMinor,
				currency: s.currency,
				amount: decimal(p.amountMinor, s.currency),
				notes: p.notes,
				createdAt: iso(p.createdAt),
			})),
		),
	};
}

export type ExportDocument = Awaited<ReturnType<typeof buildExport>>;
