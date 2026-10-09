import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "#/db";
import { notificationPreferencesSchema } from "#/features/notifications/notifications.schemas";
import {
	getUserToday,
	updatePreferences,
} from "#/features/notifications/notifications.service.server";
import { createPaymentMethod } from "#/features/payment-methods/payment-methods.service.server";
import {
	addPayment,
	createStatement,
} from "#/features/statements/statements.service.server";
import { createSubscription } from "#/features/subscriptions/subscriptions.service.server";
import type { TransactionData } from "#/features/transactions/transactions.schemas";
import { createTransaction } from "#/features/transactions/transactions.service.server";
import {
	cardData,
	createTestUser,
	deleteTestUsers,
	subscriptionData,
} from "#/test/helpers";

import { getDashboard, resolveMonth } from "./dashboard.service.server";

const today = "2025-03-10";
let alice: { id: string };
let bob: { id: string };

beforeAll(async () => {
	alice = await createTestUser();
	bob = await createTestUser();
});
afterAll(async () => {
	await deleteTestUsers([alice.id, bob.id]);
});
beforeEach(async () => {
	const where = { userId: { in: [alice.id, bob.id] } };
	await prisma.statementPayment.deleteMany({ where });
	await prisma.cardStatement.deleteMany({ where });
	await prisma.transaction.deleteMany({ where });
	await prisma.subscription.deleteMany({ where });
	await prisma.paymentMethod.deleteMany({ where });
	await prisma.category.deleteMany({ where });
	await prisma.notificationPreference.deleteMany({ where });
});

function tx(over: Partial<TransactionData> = {}): TransactionData {
	return {
		description: "Item",
		amountMinor: 100_000,
		currency: "NPR",
		occurredOn: "2025-03-05",
		categoryId: null,
		paymentMethodId: null,
		subscriptionId: null,
		refundOfId: null,
		notes: null,
		...over,
	};
}
const category = (userId: string, name: string) =>
	prisma.category.create({ data: { userId, name } });
const dash = (userId: string, month?: string, on = today) =>
	getDashboard(userId, { today: on, month });

describe("an empty account", () => {
	it("has empty sections and zero counts", async () => {
		expect(await dash(alice.id)).toMatchObject({
			month: "2025-03",
			previousMonth: "2025-02",
			nextMonth: null,
			isCurrentMonth: true,
			spending: [],
			byCategory: [],
			subscriptions: { activeCount: 0, commitments: [] },
			owed: { outstanding: [], overdueCount: 0 },
			upcoming: [],
			recent: [],
			counts: { cards: 0, subscriptions: 0, transactions: 0 },
		});
	});
});

describe("monthly spending", () => {
	it("nets refunds per currency and only counts the selected month", async () => {
		const food = await category(alice.id, "Food");
		const big = await createTransaction(
			alice.id,
			tx({ amountMinor: 500_000, categoryId: food.id }),
		);
		await createTransaction(
			alice.id,
			tx({
				refundOfId: big.id,
				amountMinor: 100_000,
				occurredOn: "2025-03-08",
				categoryId: food.id,
			}),
		);
		await createTransaction(
			alice.id,
			tx({ currency: "USD", amountMinor: 2_500, occurredOn: "2025-03-02" }),
		);
		await createTransaction(
			alice.id,
			tx({ amountMinor: 999_999, occurredOn: "2025-02-28" }),
		); // last month
		await createTransaction(
			alice.id,
			tx({ amountMinor: 777_777, occurredOn: "2025-04-01" }),
		); // next month

		const d = await dash(alice.id);
		expect(d.spending).toEqual([
			{
				currency: "NPR",
				spentMinor: 500_000,
				refundedMinor: 100_000,
				netMinor: 400_000,
			},
			{ currency: "USD", spentMinor: 2_500, refundedMinor: 0, netMinor: 2_500 },
		]);
		const npr = d.byCategory.find((b) => b.currency === "NPR");
		expect(npr?.rows).toMatchObject([
			{
				name: "Food",
				spentMinor: 500_000,
				refundedMinor: 100_000,
				netMinor: 400_000,
			},
		]);
		expect(d.byCategory.find((b) => b.currency === "USD")?.rows).toMatchObject([
			{ name: "Uncategorized", netMinor: 2_500 },
		]);
		expect(d.byCategory.map((b) => b.currency)).toEqual(["NPR", "USD"]);
	});

	it("includes the first and last day of the month and nothing outside it", async () => {
		for (const [date, amount] of [
			["2025-02-28", 1],
			["2025-03-01", 20],
			["2025-03-31", 300],
			["2025-04-01", 4000],
		] as const) {
			await createTransaction(
				alice.id,
				tx({ occurredOn: date, amountMinor: amount }),
			);
		}
		expect((await dash(alice.id)).spending[0]?.netMinor).toBe(320);
		expect((await dash(alice.id, "2025-02")).spending[0]?.netMinor).toBe(1);
	});

	it("shows a refund of last month's purchase as negative this month", async () => {
		const feb = await createTransaction(
			alice.id,
			tx({ amountMinor: 300_000, occurredOn: "2025-02-20" }),
		);
		await createTransaction(
			alice.id,
			tx({ refundOfId: feb.id, amountMinor: 50_000, occurredOn: "2025-03-03" }),
		);
		expect((await dash(alice.id)).spending).toEqual([
			{
				currency: "NPR",
				spentMinor: 0,
				refundedMinor: 50_000,
				netMinor: -50_000,
			},
		]);
		expect((await dash(alice.id, "2025-02")).spending).toEqual([
			{
				currency: "NPR",
				spentMinor: 300_000,
				refundedMinor: 0,
				netMinor: 300_000,
			},
		]);
	});

	it("selects past months and clamps future or invalid ones to the current month", async () => {
		await createTransaction(
			alice.id,
			tx({ amountMinor: 999_999, occurredOn: "2025-02-28" }),
		);
		const feb = await dash(alice.id, "2025-02");
		expect(feb).toMatchObject({
			month: "2025-02",
			previousMonth: "2025-01",
			nextMonth: "2025-03",
			isCurrentMonth: false,
		});
		expect(feb.spending[0]?.netMinor).toBe(999_999);
		for (const bad of ["2025-09", "nope", "2025-13", ""]) {
			expect((await dash(alice.id, bad)).month).toBe("2025-03");
		}
		expect(resolveMonth("2025-03", today)).toBe("2025-03");
		expect(resolveMonth(undefined, today)).toBe("2025-03");
	});

	it("never counts statement payments as spending", async () => {
		const card = await createPaymentMethod(alice.id, cardData());
		const st = await createStatement(alice.id, {
			paymentMethodId: card.id,
			currency: "NPR",
			periodStart: "2025-02-06",
			periodEnd: "2025-03-05",
			dueDate: "2025-03-20",
			statementBalanceMinor: 1_000_000,
			minimumDueMinor: null,
		});
		await addPayment(alice.id, {
			statementId: st.id,
			currency: "NPR",
			amountMinor: 1_000_000,
			paidOn: "2025-03-09",
			notes: null,
		});
		const d = await dash(alice.id);
		expect(d.spending).toEqual([]);
		expect(d.counts.transactions).toBe(0);
	});

	it("keeps archived categories, cards and subscriptions in historical totals", async () => {
		const old = await category(alice.id, "Old category");
		const card = await createPaymentMethod(
			alice.id,
			cardData({ name: "Old card" }),
		);
		const sub = await createSubscription(
			alice.id,
			subscriptionData({ name: "Old sub" }),
		);
		await createTransaction(
			alice.id,
			tx({
				amountMinor: 123_400,
				categoryId: old.id,
				paymentMethodId: card.id,
				subscriptionId: sub.id,
				occurredOn: "2025-02-14",
			}),
		);
		await prisma.category.update({
			where: { id: old.id },
			data: { archivedAt: new Date() },
		});
		await prisma.paymentMethod.update({
			where: { id: card.id },
			data: { archivedAt: new Date() },
		});
		await prisma.subscription.update({
			where: { id: sub.id },
			data: { archivedAt: new Date() },
		});

		const d = await dash(alice.id, "2025-02");
		expect(d.spending[0]?.netMinor).toBe(123_400);
		expect(d.byCategory[0]?.rows[0]).toMatchObject({
			name: "Old category",
			netMinor: 123_400,
		});
		expect(d.recent[0]?.paymentMethod?.name).toBe("Old card");
	});

	it("follows the user's time zone for the current month", async () => {
		const instant = new Date("2025-02-28T20:00:00Z"); // March 1 in Kathmandu, still Feb 28 in UTC
		const prefs = (timezone: string) =>
			notificationPreferencesSchema.parse({
				timezone,
				emailEnabled: true,
				offsetsDays: [7, 3, 1],
				renewalEnabled: true,
				expiryEnabled: true,
				cancellationEnabled: true,
				paymentDueEnabled: true,
			});
		await updatePreferences(alice.id, prefs("Asia/Kathmandu"));
		await updatePreferences(bob.id, prefs("UTC"));
		await createTransaction(
			alice.id,
			tx({ amountMinor: 11_100, occurredOn: "2025-03-01" }),
		);
		await createTransaction(
			bob.id,
			tx({ amountMinor: 22_200, occurredOn: "2025-02-28" }),
		);

		const aliceToday = await getUserToday(alice.id, instant);
		const bobToday = await getUserToday(bob.id, instant);
		expect([aliceToday, bobToday]).toEqual(["2025-03-01", "2025-02-28"]);
		expect(await dash(alice.id, undefined, aliceToday)).toMatchObject({
			month: "2025-03",
		});
		expect(
			(await dash(alice.id, undefined, aliceToday)).spending[0]?.netMinor,
		).toBe(11_100);
		expect((await dash(bob.id, undefined, bobToday)).month).toBe("2025-02");
		expect(
			(await dash(bob.id, undefined, bobToday)).spending[0]?.netMinor,
		).toBe(22_200);
	});
});

describe("subscriptions", () => {
	it("totals the monthly commitment per currency for subscriptions that still renew", async () => {
		await createSubscription(
			alice.id,
			subscriptionData({ name: "A", amountMinor: 64_900 }),
		);
		await createSubscription(
			alice.id,
			subscriptionData({ name: "B", amountMinor: 10_000 }),
		);
		await createSubscription(
			alice.id,
			subscriptionData({ name: "US", amountMinor: 999, currency: "USD" }),
		);
		const cancelled = await createSubscription(
			alice.id,
			subscriptionData({ name: "Gone", amountMinor: 50_000 }),
		);
		await prisma.subscription.update({
			where: { id: cancelled.id },
			data: { status: "CANCELLED" },
		});
		const archived = await createSubscription(
			alice.id,
			subscriptionData({ name: "Archived", amountMinor: 70_000 }),
		);
		await prisma.subscription.update({
			where: { id: archived.id },
			data: { archivedAt: new Date() },
		});

		const d = await dash(alice.id);
		expect(d.subscriptions.activeCount).toBe(3);
		expect(d.subscriptions.commitments).toEqual([
			{ currency: "NPR", monthlyMinor: 74_900, count: 2 },
			{ currency: "USD", monthlyMinor: 999, count: 1 },
		]);
	});
});

describe("owed and coming up", () => {
	it("combines unpaid statements, overdue ones first, the due-day fallback and renewals", async () => {
		const withStatements = await createPaymentMethod(
			alice.id,
			cardData({ name: "Statement card", last4: "1111", paymentDueDay: 20 }),
		);
		const noStatements = await createPaymentMethod(
			alice.id,
			cardData({ name: "Plain card", last4: "2222", paymentDueDay: 25 }),
		);
		const archivedCard = await createPaymentMethod(
			alice.id,
			cardData({ name: "Archived card", last4: "3333", paymentDueDay: 12 }),
		);
		await prisma.paymentMethod.update({
			where: { id: archivedCard.id },
			data: { archivedAt: new Date() },
		});

		const mk = (
			periodStart: string,
			periodEnd: string,
			dueDate: string,
			balance: number,
		) =>
			createStatement(alice.id, {
				paymentMethodId: withStatements.id,
				currency: "NPR",
				periodStart,
				periodEnd,
				dueDate,
				statementBalanceMinor: balance,
				minimumDueMinor: null,
			});
		const overdue = await mk("2025-01-01", "2025-01-31", "2025-02-15", 100_000);
		const open = await mk("2025-02-01", "2025-03-05", "2025-03-20", 500_000);
		const paid = await mk("2024-12-01", "2024-12-31", "2025-01-15", 300_000);
		await addPayment(alice.id, {
			statementId: open.id,
			currency: "NPR",
			amountMinor: 100_000,
			paidOn: "2025-03-09",
			notes: null,
		});
		await addPayment(alice.id, {
			statementId: paid.id,
			currency: "NPR",
			amountMinor: 300_000,
			paidOn: "2025-01-10",
			notes: null,
		});
		await createSubscription(
			alice.id,
			subscriptionData({ name: "Streaming", anchorDate: "2025-01-15" }),
		); // renews 03-15

		const d = await dash(alice.id);
		expect(d.owed).toEqual({
			outstanding: [{ currency: "NPR", outstandingMinor: 500_000 }],
			overdueCount: 1,
		});
		expect(d.upcoming.map((e) => [e.kind, e.label, e.date])).toEqual([
			["STATEMENT_OVERDUE", "Statement card", "2025-02-15"],
			["RENEWAL", "Streaming", "2025-03-15"],
			["STATEMENT_DUE", "Statement card", "2025-03-20"],
			["CARD_DUE_DAY", "Plain card", "2025-03-25"],
		]);
		expect(d.upcoming[0]).toMatchObject({
			amountMinor: 100_000,
			target: { type: "statement", id: overdue.id },
		});
		expect(d.upcoming[2]).toMatchObject({
			amountMinor: 400_000,
			target: { type: "statement", id: open.id },
		});
		expect(noStatements.id).toBeDefined();
	});
});

describe("recent transactions", () => {
	it("returns the five newest across months, newest first", async () => {
		for (let i = 1; i <= 7; i++) {
			await createTransaction(
				alice.id,
				tx({
					description: `T${i}`,
					occurredOn: `2025-0${i < 4 ? 1 : 2}-${String(10 + i).padStart(2, "0")}`,
				}),
			);
		}
		const d = await dash(alice.id);
		expect(d.recent).toHaveLength(5);
		expect(d.recent.map((r) => r.description)).toEqual([
			"T7",
			"T6",
			"T5",
			"T4",
			"T3",
		]);
		expect(d.counts.transactions).toBe(7);
	});
});

describe("isolation", () => {
	it("never shows another user's data in any section", async () => {
		const theirFood = await category(bob.id, "Their food");
		const theirCard = await createPaymentMethod(
			bob.id,
			cardData({ name: "Their card", paymentDueDay: 22 }),
		);
		await createSubscription(
			bob.id,
			subscriptionData({ name: "Their sub", anchorDate: "2025-01-12" }),
		);
		await createTransaction(
			bob.id,
			tx({
				description: "Their lunch",
				amountMinor: 888_800,
				categoryId: theirFood.id,
				paymentMethodId: theirCard.id,
			}),
		);
		await createStatement(bob.id, {
			paymentMethodId: theirCard.id,
			currency: "NPR",
			periodStart: "2025-02-01",
			periodEnd: "2025-03-05",
			dueDate: "2025-03-20",
			statementBalanceMinor: 777_700,
			minimumDueMinor: null,
		});

		expect(await dash(alice.id)).toMatchObject({
			spending: [],
			byCategory: [],
			recent: [],
			upcoming: [],
			subscriptions: { activeCount: 0, commitments: [] },
			owed: { outstanding: [], overdueCount: 0 },
			counts: { cards: 0, subscriptions: 0, transactions: 0 },
		});
		const theirs = await dash(bob.id);
		expect(theirs.spending[0]?.netMinor).toBe(888_800);
		expect(theirs.owed.outstanding[0]?.outstandingMinor).toBe(777_700);
	});
});
