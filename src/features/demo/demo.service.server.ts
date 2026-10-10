import { randomBytes, randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";

import { prisma } from "#/db";
import { listCategories } from "#/features/categories/categories.service.server";
import { createPaymentMethod } from "#/features/payment-methods/payment-methods.service.server";
import {
	addPayment,
	createStatement,
} from "#/features/statements/statements.service.server";
import {
	cancelSubscription,
	createSubscription,
} from "#/features/subscriptions/subscriptions.service.server";
import { createTransaction } from "#/features/transactions/transactions.service.server";
import type { CalendarDate } from "#/lib/calendar-date";

import { DEMO_EMAIL, DEMO_NAME, type DemoData } from "./demo-data";

/** A random password, shown once by the seed script and never stored anywhere in the repo. */
export function generateDemoPassword() {
	return randomBytes(18).toString("base64url");
}

/**
 * (Re)create the demo account. Any previous demo user is removed first (everything it owns
 * cascades), so running the seed again always starts from a clean demo account. Only the account
 * with the reserved demo address is ever touched. The account is created directly, on purpose:
 * the sign-up policy (SIGNUP_MODE) is about real people registering.
 */
export async function createDemoUser(password: string) {
	await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });
	const id = randomUUID();
	await prisma.user.create({
		data: {
			id,
			name: DEMO_NAME,
			email: DEMO_EMAIL,
			emailVerified: true,
			accounts: {
				create: {
					id: randomUUID(),
					accountId: id,
					providerId: "credential",
					password: await hashPassword(password),
				},
			},
		},
	});
	return id;
}

/**
 * Fill an account with demo data through the same services the app uses, so every business
 * rule applies. Reminder emails are switched off: the demo address is not a real mailbox.
 */
export async function applyDemoData(
	userId: string,
	data: DemoData,
	today: CalendarDate,
) {
	const categoryIds = new Map(
		(await listCategories(userId)).map((c) => [c.name, c.id]),
	);

	const cardIds = new Map<string, string>();
	const cardCurrency = new Map<string, "NPR" | "USD">();
	for (const card of data.cards) {
		const created = await createPaymentMethod(userId, {
			name: card.name,
			issuer: card.issuer,
			last4: card.last4,
			currency: card.currency,
			creditLimitMinor: card.creditLimitMinor,
			statementDay: card.statementDay,
			paymentDueDay: card.paymentDueDay,
		});
		cardIds.set(card.key, created.id);
		cardCurrency.set(card.key, card.currency);
	}

	const subscriptionIds = new Map<string, string>();
	for (const s of data.subscriptions) {
		const created = await createSubscription(userId, {
			name: s.name,
			amountMinor: s.amountMinor,
			currency: s.currency,
			intervalCount: s.intervalCount,
			intervalUnit: s.intervalUnit,
			anchorDate: s.anchorDate,
			paymentMethodId: s.cardKey ? (cardIds.get(s.cardKey) ?? null) : null,
			autoRenew: s.autoRenew,
			expiresOn: s.expiresOn,
			cancellationDeadline: s.cancellationDeadline,
			notes: null,
		});
		subscriptionIds.set(s.name, created.id);
		if (s.cancelled) {
			await cancelSubscription(userId, created.id, { today, expiresOn: null });
		}
	}

	// Oldest first, expenses before the refunds that point at them.
	const transactionIds = new Map<string, string>();
	for (const t of data.transactions) {
		const created = await createTransaction(userId, {
			description: t.description,
			amountMinor: t.amountMinor,
			currency: t.currency,
			occurredOn: t.occurredOn,
			categoryId: t.category ? (categoryIds.get(t.category) ?? null) : null,
			paymentMethodId: t.cardKey ? (cardIds.get(t.cardKey) ?? null) : null,
			subscriptionId: t.subscriptionName
				? (subscriptionIds.get(t.subscriptionName) ?? null)
				: null,
			refundOfId: t.refundOfKey
				? (transactionIds.get(t.refundOfKey) ?? null)
				: null,
			notes: null,
		});
		transactionIds.set(t.key, created.id);
	}

	let payments = 0;
	for (const s of data.statements) {
		const paymentMethodId = cardIds.get(s.cardKey);
		const currency = cardCurrency.get(s.cardKey);
		if (!paymentMethodId || !currency)
			throw new Error(`Unknown card ${s.cardKey}`);
		const created = await createStatement(userId, {
			paymentMethodId,
			currency,
			periodStart: s.periodStart,
			periodEnd: s.periodEnd,
			dueDate: s.dueDate,
			statementBalanceMinor: s.balanceMinor,
			minimumDueMinor: s.minimumDueMinor,
		});
		for (const p of s.payments) {
			await addPayment(userId, {
				statementId: created.id,
				currency,
				amountMinor: p.amountMinor,
				paidOn: p.paidOn,
				notes: null,
			});
			payments++;
		}
	}

	await prisma.notificationPreference.upsert({
		where: { userId },
		create: { userId, emailEnabled: false },
		update: { emailEnabled: false },
	});

	return {
		cards: data.cards.length,
		subscriptions: data.subscriptions.length,
		transactions: data.transactions.length,
		statements: data.statements.length,
		payments,
	};
}
