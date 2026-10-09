import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "#/db";
import { cardData, createTestUser, deleteTestUsers } from "#/test/helpers";

import { paymentMethodInputSchema } from "./payment-methods.schemas";
import {
	createPaymentMethod,
	getPaymentMethod,
	listPaymentMethods,
	setPaymentMethodArchived,
	updatePaymentMethod,
} from "./payment-methods.service.server";

let alice: { id: string };
let bob: { id: string };

beforeAll(async () => {
	alice = await createTestUser();
	bob = await createTestUser();
});

afterAll(async () => {
	await deleteTestUsers([alice.id, bob.id]);
});

describe("payment methods are user-scoped", () => {
	it("lists only the caller's cards", async () => {
		const mine = await createPaymentMethod(
			alice.id,
			cardData({ name: "Alice card" }),
		);
		await createPaymentMethod(bob.id, cardData({ name: "Bob card" }));

		const aliceCards = await listPaymentMethods(alice.id);
		expect(aliceCards.map((c) => c.id)).toContain(mine.id);
		expect(aliceCards.every((c) => c.userId === alice.id)).toBe(true);
	});

	it("does not let another user read, update or archive a card", async () => {
		const card = await createPaymentMethod(
			alice.id,
			cardData({ name: "Private" }),
		);

		expect(await getPaymentMethod(bob.id, card.id)).toBeNull();
		await expect(
			updatePaymentMethod(bob.id, card.id, cardData({ name: "Hijacked" })),
		).rejects.toThrow("not found");
		await expect(
			setPaymentMethodArchived(bob.id, card.id, true),
		).rejects.toThrow("not found");

		const untouched = await getPaymentMethod(alice.id, card.id);
		expect(untouched?.name).toBe("Private");
		expect(untouched?.archivedAt).toBeNull();
	});
});

describe("archiving", () => {
	it("hides archived cards by default and keeps them retrievable", async () => {
		const card = await createPaymentMethod(
			alice.id,
			cardData({ name: "Old card" }),
		);
		await setPaymentMethodArchived(alice.id, card.id, true);

		expect((await listPaymentMethods(alice.id)).map((c) => c.id)).not.toContain(
			card.id,
		);
		expect(
			(await listPaymentMethods(alice.id, { includeArchived: true })).map(
				(c) => c.id,
			),
		).toContain(card.id);

		await setPaymentMethodArchived(alice.id, card.id, false);
		expect((await listPaymentMethods(alice.id)).map((c) => c.id)).toContain(
			card.id,
		);
	});
});

describe("database constraints", () => {
	it("rejects anything but four digits for last4 even if validation is bypassed", async () => {
		await expect(
			prisma.paymentMethod.create({
				data: { ...cardData({ last4: "12a4" }), userId: alice.id },
			}),
		).rejects.toThrow();
		await expect(
			prisma.$executeRawUnsafe(
				`insert into payment_method (id, "userId", name, last4, currency, "updatedAt")
				 values (gen_random_uuid(), '${alice.id}', 'x', '1234', 'npr', now())`,
			),
		).rejects.toThrow();
	});
});

describe("paymentMethodInputSchema", () => {
	const valid = {
		name: "Daily card",
		issuer: "",
		last4: "4242",
		currency: "NPR",
		creditLimit: "100,000.00",
		statementDay: "5",
		paymentDueDay: "",
	};

	it("normalises form strings", () => {
		expect(paymentMethodInputSchema.parse(valid)).toEqual({
			name: "Daily card",
			issuer: null,
			last4: "4242",
			currency: "NPR",
			creditLimitMinor: 10_000_000,
			statementDay: 5,
			paymentDueDay: null,
		});
		expect(
			paymentMethodInputSchema.parse({ ...valid, creditLimit: "" })
				.creditLimitMinor,
		).toBeNull();
	});

	it.each([
		["a full card number", { last4: "4242424242424242" }],
		["too few digits", { last4: "424" }],
		["non-digits", { last4: "42a2" }],
		["a missing name", { name: "  " }],
		["day 0", { statementDay: "0" }],
		["day 32", { paymentDueDay: "32" }],
		["a bad limit", { creditLimit: "abc" }],
		["a zero limit", { creditLimit: "0" }],
		["an unsupported currency", { currency: "XXX" }],
	])("rejects %s", (_label, patch) => {
		expect(
			paymentMethodInputSchema.safeParse({ ...valid, ...patch }).success,
		).toBe(false);
	});
});
