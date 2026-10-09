import { randomUUID } from "node:crypto";

import { prisma } from "#/db";

import type { PaymentMethodData } from "#/features/payment-methods/payment-methods.schemas";
import type { SubscriptionData } from "#/features/subscriptions/subscriptions.schemas";

export async function createTestUser() {
	const id = randomUUID();
	return prisma.user.create({
		data: { id, name: "Test User", email: `${id}@example.test` },
	});
}

export async function deleteTestUsers(ids: string[]) {
	await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

export function cardData(
	overrides: Partial<PaymentMethodData> = {},
): PaymentMethodData {
	return {
		name: "Daily card",
		issuer: "Test Bank",
		last4: "4242",
		currency: "NPR",
		creditLimitMinor: 10_000_000,
		statementDay: 5,
		paymentDueDay: 20,
		...overrides,
	};
}

export function subscriptionData(
	overrides: Partial<SubscriptionData> = {},
): SubscriptionData {
	return {
		name: "Streaming",
		amountMinor: 99_900,
		currency: "NPR",
		intervalCount: 1,
		intervalUnit: "MONTH",
		anchorDate: "2025-01-31",
		paymentMethodId: null,
		autoRenew: true,
		expiresOn: null,
		cancellationDeadline: null,
		notes: null,
		...overrides,
	};
}
