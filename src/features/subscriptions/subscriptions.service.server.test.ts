import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "#/db";
import { createPaymentMethod } from "#/features/payment-methods/payment-methods.service.server";
import {
	cardData,
	createTestUser,
	deleteTestUsers,
	subscriptionData,
} from "#/test/helpers";

import { subscriptionInputSchema } from "./subscriptions.schemas";
import {
	cancelSubscription,
	createSubscription,
	getSubscription,
	listSubscriptions,
	reactivateSubscription,
	setSubscriptionArchived,
	updateSubscription,
} from "./subscriptions.service.server";

let alice: { id: string };
let bob: { id: string };
const today = "2025-02-10";

beforeAll(async () => {
	alice = await createTestUser();
	bob = await createTestUser();
});

afterAll(async () => {
	await deleteTestUsers([alice.id, bob.id]);
});

async function viewOf(userId: string, id: string) {
	return getSubscription(userId, id, today);
}

describe("derived values", () => {
	it("computes next renewal, state and monthly cost without storing them", async () => {
		const sub = await createSubscription(alice.id, subscriptionData());
		const view = await viewOf(alice.id, sub.id);
		expect(view?.nextRenewal).toBe("2025-02-28"); // Jan 31 anchor, clamped for February
		expect(view?.state).toBe("ACTIVE");
		expect(view?.monthlyEquivalentMinor).toBe(99_900);
		expect(view?.anchorDate).toBe("2025-01-31");
	});

	it("normalises a yearly plan to a monthly figure", async () => {
		const sub = await createSubscription(
			alice.id,
			subscriptionData({ amountMinor: 1_200_000, intervalUnit: "YEAR" }),
		);
		expect((await viewOf(alice.id, sub.id))?.monthlyEquivalentMinor).toBe(
			100_000,
		);
	});
});

describe("lifecycle", () => {
	it("cancels, stops renewals, and can be reactivated", async () => {
		const sub = await createSubscription(
			alice.id,
			subscriptionData({ name: "Cancel me" }),
		);

		await cancelSubscription(alice.id, sub.id, { today, expiresOn: null });
		const cancelled = await viewOf(alice.id, sub.id);
		expect(cancelled?.status).toBe("CANCELLED");
		expect(cancelled?.cancelledOn).toBe(today);
		expect(cancelled?.nextRenewal).toBeNull();
		expect(cancelled?.state).toBe("CANCELLED");

		await reactivateSubscription(alice.id, sub.id);
		const back = await viewOf(alice.id, sub.id);
		expect(back?.status).toBe("ACTIVE");
		expect(back?.cancelledOn).toBeNull();
		expect(back?.nextRenewal).toBe("2025-02-28");
	});

	it("keeps access until the end of the paid period when an end date is given", async () => {
		const sub = await createSubscription(
			alice.id,
			subscriptionData({ name: "Paid until" }),
		);
		await cancelSubscription(alice.id, sub.id, {
			today,
			expiresOn: "2025-02-28",
		});
		const view = await viewOf(alice.id, sub.id);
		expect(view?.state).toBe("NOT_RENEWING");
		expect(view?.expiresOn).toBe("2025-02-28");
		expect(view?.nextRenewal).toBeNull();
	});

	// Cancelling with an end date used to overwrite `expiresOn` and nothing remembered the
	// earlier value, so a reactivated plan kept the cancel date: it showed as expiring, then
	// expired, and dropped out of renewals, reminders and the monthly commitment.
	describe("reactivating after a cancellation with an end date", () => {
		it("restores the end date the plan had before it was cancelled", async () => {
			const sub = await createSubscription(
				alice.id,
				subscriptionData({ name: "Fixed term", expiresOn: "2027-01-01" }),
			);
			await cancelSubscription(alice.id, sub.id, {
				today,
				expiresOn: "2025-02-28",
			});
			expect((await viewOf(alice.id, sub.id))?.expiresOn).toBe("2025-02-28");

			await reactivateSubscription(alice.id, sub.id);
			const back = await viewOf(alice.id, sub.id);
			expect(back?.status).toBe("ACTIVE");
			expect(back?.expiresOn).toBe("2027-01-01");
			expect(back?.state).toBe("ACTIVE");
			expect(back?.nextRenewal).toBe("2025-02-28");
		});

		it("clears the cancel date when the plan had no end date before", async () => {
			const sub = await createSubscription(
				alice.id,
				subscriptionData({ name: "Open ended" }),
			);
			await cancelSubscription(alice.id, sub.id, {
				today,
				expiresOn: "2025-02-28",
			});
			await reactivateSubscription(alice.id, sub.id);
			const back = await viewOf(alice.id, sub.id);
			expect(back?.expiresOn).toBeNull();
			expect(back?.state).toBe("ACTIVE");
		});

		it("leaves the end date alone when it was cancelled without a new one", async () => {
			const sub = await createSubscription(
				alice.id,
				subscriptionData({ name: "Untouched", expiresOn: "2027-01-01" }),
			);
			await cancelSubscription(alice.id, sub.id, { today, expiresOn: null });
			expect((await viewOf(alice.id, sub.id))?.expiresOn).toBe("2027-01-01");
			await reactivateSubscription(alice.id, sub.id);
			expect((await viewOf(alice.id, sub.id))?.expiresOn).toBe("2027-01-01");
		});

		it("is not confused by cancelling twice", async () => {
			const sub = await createSubscription(
				alice.id,
				subscriptionData({ name: "Twice", expiresOn: "2027-01-01" }),
			);
			await cancelSubscription(alice.id, sub.id, {
				today,
				expiresOn: "2025-02-28",
			});
			await cancelSubscription(alice.id, sub.id, {
				today,
				expiresOn: "2025-03-15",
			});
			expect((await viewOf(alice.id, sub.id))?.expiresOn).toBe("2025-03-15");
			await reactivateSubscription(alice.id, sub.id);
			expect((await viewOf(alice.id, sub.id))?.expiresOn).toBe("2027-01-01");
		});

		it("does nothing to the end date of a plan that was never cancelled", async () => {
			const sub = await createSubscription(
				alice.id,
				subscriptionData({ name: "Never cancelled", expiresOn: "2027-01-01" }),
			);
			await reactivateSubscription(alice.id, sub.id);
			expect((await viewOf(alice.id, sub.id))?.expiresOn).toBe("2027-01-01");
		});
	});

	it("archives and hides from the default list", async () => {
		const sub = await createSubscription(
			alice.id,
			subscriptionData({ name: "Archive me" }),
		);
		await setSubscriptionArchived(alice.id, sub.id, true);
		const visible = await listSubscriptions(alice.id, { today });
		expect(visible.map((s) => s.id)).not.toContain(sub.id);
		const all = await listSubscriptions(alice.id, {
			today,
			includeArchived: true,
		});
		expect(all.find((s) => s.id === sub.id)?.archived).toBe(true);
	});
});

describe("ownership", () => {
	it("does not let another user read or change a subscription", async () => {
		const sub = await createSubscription(
			alice.id,
			subscriptionData({ name: "Alice only" }),
		);

		expect(await viewOf(bob.id, sub.id)).toBeNull();
		expect(
			(await listSubscriptions(bob.id, { today })).map((s) => s.id),
		).not.toContain(sub.id);
		await expect(
			updateSubscription(bob.id, sub.id, subscriptionData({ name: "Hijack" })),
		).rejects.toThrow("not found");
		await expect(
			cancelSubscription(bob.id, sub.id, { today, expiresOn: null }),
		).rejects.toThrow("not found");
		await expect(reactivateSubscription(bob.id, sub.id)).rejects.toThrow(
			"not found",
		);
		await expect(setSubscriptionArchived(bob.id, sub.id, true)).rejects.toThrow(
			"not found",
		);

		const untouched = await viewOf(alice.id, sub.id);
		expect(untouched?.name).toBe("Alice only");
		expect(untouched?.status).toBe("ACTIVE");
		expect(untouched?.archived).toBe(false);
	});

	it("refuses to link another user's card", async () => {
		const bobsCard = await createPaymentMethod(bob.id, cardData());
		await expect(
			createSubscription(
				alice.id,
				subscriptionData({ paymentMethodId: bobsCard.id }),
			),
		).rejects.toThrow("Payment method not found");

		const sub = await createSubscription(alice.id, subscriptionData());
		await expect(
			updateSubscription(
				alice.id,
				sub.id,
				subscriptionData({ paymentMethodId: bobsCard.id }),
			),
		).rejects.toThrow("Payment method not found");
	});

	it("links own cards, but not archived ones (existing links are kept)", async () => {
		const card = await createPaymentMethod(
			alice.id,
			cardData({ name: "Linked" }),
		);
		const sub = await createSubscription(
			alice.id,
			subscriptionData({ paymentMethodId: card.id }),
		);
		expect((await viewOf(alice.id, sub.id))?.paymentMethod?.name).toBe(
			"Linked",
		);

		await prisma.paymentMethod.update({
			where: { id: card.id },
			data: { archivedAt: new Date() },
		});
		// Editing keeps the existing (now archived) link...
		await expect(
			updateSubscription(
				alice.id,
				sub.id,
				subscriptionData({ name: "Renamed", paymentMethodId: card.id }),
			),
		).resolves.toBeUndefined();
		// ...but a new subscription cannot be attached to an archived card.
		await expect(
			createSubscription(
				alice.id,
				subscriptionData({ paymentMethodId: card.id }),
			),
		).rejects.toThrow("Payment method not found");
	});
});

describe("referential integrity", () => {
	it("blocks deleting a card that still has subscriptions, but a user delete cascades cleanly", async () => {
		const carol = await createTestUser();
		const card = await createPaymentMethod(carol.id, cardData());
		await createSubscription(
			carol.id,
			subscriptionData({ paymentMethodId: card.id }),
		);

		await expect(
			prisma.paymentMethod.delete({ where: { id: card.id } }),
		).rejects.toThrow();

		await prisma.user.delete({ where: { id: carol.id } });
		expect(
			await prisma.paymentMethod.count({ where: { userId: carol.id } }),
		).toBe(0);
		expect(
			await prisma.subscription.count({ where: { userId: carol.id } }),
		).toBe(0);
	});

	it("enforces positive amounts and expiry order in the database", async () => {
		await expect(
			prisma.subscription.create({
				data: {
					userId: alice.id,
					name: "x",
					amountMinor: 0,
					currency: "NPR",
					intervalCount: 1,
					intervalUnit: "MONTH",
					anchorDate: new Date("2025-01-01"),
				},
			}),
		).rejects.toThrow();
		await expect(
			prisma.subscription.create({
				data: {
					userId: alice.id,
					name: "x",
					amountMinor: 100,
					currency: "NPR",
					intervalCount: 1,
					intervalUnit: "MONTH",
					anchorDate: new Date("2025-01-10"),
					expiresOn: new Date("2025-01-01"),
				},
			}),
		).rejects.toThrow();
	});
});

describe("subscriptionInputSchema", () => {
	const valid = {
		name: "Netflix",
		amount: "649",
		currency: "NPR",
		intervalCount: "1",
		intervalUnit: "MONTH",
		anchorDate: "2025-01-31",
		paymentMethodId: "",
		autoRenew: true,
		expiresOn: "",
		cancellationDeadline: "",
		notes: "",
	};

	it("normalises form strings", () => {
		const parsed = subscriptionInputSchema.parse(valid);
		expect(parsed.amountMinor).toBe(64_900);
		expect(parsed.paymentMethodId).toBeNull();
		expect(parsed.expiresOn).toBeNull();
		expect(parsed.notes).toBeNull();
		expect(parsed.intervalCount).toBe(1);
	});

	it.each([
		["a zero amount", { amount: "0" }],
		["too many decimals", { amount: "1.234" }],
		["a bad date", { anchorDate: "2025-02-30" }],
		["expiry before the first billing date", { expiresOn: "2024-12-31" }],
		["a zero interval", { intervalCount: "0" }],
		["a huge interval", { intervalCount: "1000" }],
		["an unknown unit", { intervalUnit: "DAY" }],
		["a non-uuid card id", { paymentMethodId: "not-a-uuid" }],
	])("rejects %s", (_label, patch) => {
		expect(
			subscriptionInputSchema.safeParse({ ...valid, ...patch }).success,
		).toBe(false);
	});
});
