import { randomUUID } from "node:crypto";

import { hashPassword } from "better-auth/crypto";

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

/** A user who can sign in with a password (a credential account like sign-up creates). */
export async function createUserWithPassword(password = "test-password-12345") {
	const user = await createTestUser();
	await prisma.account.create({
		data: {
			id: randomUUID(),
			accountId: user.id,
			providerId: "credential",
			userId: user.id,
			password: await hashPassword(password),
		},
	});
	return { user, password };
}

/** Sign in through Better Auth and return request headers carrying the session cookie. */
export async function signInHeaders(email: string, password: string) {
	const { auth } = await import("#/lib/auth");
	const response = await auth.api.signInEmail({
		body: { email, password },
		returnHeaders: true,
	});
	const cookie = response.headers
		.getSetCookie()
		.map((c) => c.split(";")[0])
		.join("; ");
	return new Headers({ cookie });
}
