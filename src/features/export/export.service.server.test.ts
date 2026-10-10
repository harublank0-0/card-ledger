import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "#/db";
import { createPaymentMethod } from "#/features/payment-methods/payment-methods.service.server";
import {
	addPayment,
	createStatement,
	getStatement,
} from "#/features/statements/statements.service.server";
import {
	monthlyCommitments,
	monthlyEquivalentMinor,
} from "#/features/subscriptions/subscriptions.logic";
import {
	createSubscription,
	listSubscriptions,
} from "#/features/subscriptions/subscriptions.service.server";
import { netByCurrency } from "#/features/transactions/transactions.logic";
import { transactionFiltersSchema } from "#/features/transactions/transactions.schemas";
import {
	createTransaction,
	listTransactions,
} from "#/features/transactions/transactions.service.server";
import {
	cardData,
	createTestUser,
	createUserWithPassword,
	deleteTestUsers,
	subscriptionData,
} from "#/test/helpers";

import {
	CSV_ENTITIES,
	type CsvEntity,
	csvForEntity,
	EXPORT_FORMAT,
	EXPORT_VERSION,
} from "./export.logic";
import { buildExport } from "./export.service.server";

const NOW = new Date("2026-10-10T08:00:00Z");
let alice: { id: string; email: string };
let bob: { id: string; email: string };
let bobPasswordHash = "";
const BOB_TOKEN = "BOB-SESSION-TOKEN-MARKER";

beforeAll(async () => {
	alice = await createTestUser();
	const b = await createUserWithPassword();
	bob = b.user;
	bobPasswordHash =
		(await prisma.account.findFirstOrThrow({ where: { userId: bob.id } }))
			.password ?? "";
});
afterAll(async () => {
	await deleteTestUsers([alice.id, bob.id]);
});
beforeEach(async () => {
	const where = { userId: { in: [alice.id, bob.id] } };
	await prisma.session.deleteMany({ where });
	await prisma.statementPayment.deleteMany({ where });
	await prisma.cardStatement.deleteMany({ where });
	await prisma.transaction.deleteMany({ where });
	await prisma.subscription.deleteMany({ where });
	await prisma.paymentMethod.deleteMany({ where });
	await prisma.category.deleteMany({ where });
	await prisma.notificationPreference.deleteMany({ where });
});

const tx = (over: object = {}) =>
	({
		description: "Item",
		amountMinor: 100_000,
		currency: "NPR",
		occurredOn: "2026-10-05",
		categoryId: null,
		paymentMethodId: null,
		subscriptionId: null,
		refundOfId: null,
		notes: null,
		...over,
	}) as Parameters<typeof createTransaction>[1];

async function seedAlice() {
	const food = await prisma.category.create({
		data: { userId: alice.id, name: "Food" },
	});
	const oldCat = await prisma.category.create({
		data: { userId: alice.id, name: "Old" },
	});
	const card = await createPaymentMethod(
		alice.id,
		cardData({
			name: "Daily card",
			last4: "0000",
			creditLimitMinor: 5_000_000,
		}),
	);
	const retired = await createPaymentMethod(
		alice.id,
		cardData({ name: "Retired card", last4: "9999" }),
	);
	await prisma.paymentMethod.update({
		where: { id: retired.id },
		data: { archivedAt: new Date("2026-02-01") },
	});
	const sub = await createSubscription(
		alice.id,
		subscriptionData({
			name: "Streaming",
			amountMinor: 64_900,
			paymentMethodId: card.id,
		}),
	);
	const archivedSub = await createSubscription(
		alice.id,
		subscriptionData({ name: "Old sub", amountMinor: 10_000 }),
	);
	await prisma.subscription.update({
		where: { id: archivedSub.id },
		data: { archivedAt: new Date("2026-03-01") },
	});

	const groceries = await createTransaction(
		alice.id,
		tx({
			description: "Groceries",
			amountMinor: 500_000,
			categoryId: food.id,
			paymentMethodId: card.id,
		}),
	);
	await createTransaction(
		alice.id,
		tx({
			description: "Returned groceries",
			amountMinor: 120_000,
			categoryId: food.id,
			paymentMethodId: card.id,
			refundOfId: groceries.id,
			occurredOn: "2026-10-07",
		}),
	);
	await createTransaction(
		alice.id,
		tx({
			description: "Airport",
			amountMinor: 2_500,
			currency: "USD",
			occurredOn: "2026-09-20",
		}),
	);
	await createTransaction(
		alice.id,
		tx({
			description: '=HYPERLINK("http://evil.example","click")',
			amountMinor: 1_000,
			notes: 'Quote " and, comma',
			categoryId: oldCat.id,
		}),
	);
	await createTransaction(
		alice.id,
		tx({
			description: "Streaming charge",
			amountMinor: 64_900,
			subscriptionId: sub.id,
			paymentMethodId: card.id,
		}),
	);

	// Archive only after use: new links to archived categories are (correctly) refused.
	await prisma.category.update({
		where: { id: oldCat.id },
		data: { archivedAt: new Date("2026-01-01") },
	});

	const statement = await createStatement(alice.id, {
		paymentMethodId: card.id,
		currency: "NPR",
		periodStart: "2026-09-06",
		periodEnd: "2026-10-05",
		dueDate: "2026-10-20",
		statementBalanceMinor: 1_200_000,
		minimumDueMinor: 120_000,
	});
	await addPayment(alice.id, {
		statementId: statement.id,
		currency: "NPR",
		amountMinor: 400_000,
		paidOn: "2026-10-08",
		notes: "Partial",
	});
	await prisma.notificationPreference.create({
		data: { userId: alice.id, timezone: "Asia/Kathmandu", offsetsDays: [7, 1] },
	});
	return { statementId: statement.id };
}

async function seedBob() {
	const cat = await prisma.category.create({
		data: { userId: bob.id, name: "BOB-CATEGORY" },
	});
	const card = await createPaymentMethod(
		bob.id,
		cardData({ name: "BOB-CARD", last4: "8888" }),
	);
	await createSubscription(
		bob.id,
		subscriptionData({ name: "BOB-SUBSCRIPTION" }),
	);
	await createTransaction(
		bob.id,
		tx({
			description: "BOB-LUNCH",
			amountMinor: 987_654,
			categoryId: cat.id,
			paymentMethodId: card.id,
		}),
	);
	const st = await createStatement(bob.id, {
		paymentMethodId: card.id,
		currency: "NPR",
		periodStart: "2026-09-06",
		periodEnd: "2026-10-05",
		dueDate: "2026-10-20",
		statementBalanceMinor: 777_700,
		minimumDueMinor: null,
	});
	await addPayment(bob.id, {
		statementId: st.id,
		currency: "NPR",
		amountMinor: 1,
		paidOn: "2026-10-08",
		notes: "BOB-NOTE",
	});
	await prisma.session.create({
		data: {
			id: "bob-session-id",
			token: BOB_TOKEN,
			userId: bob.id,
			expiresAt: new Date("2030-01-01"),
		},
	});
}

describe("export contents", () => {
	it("describes the format and the account", async () => {
		const doc = await buildExport(alice.id, NOW);
		expect(doc).toMatchObject({
			format: EXPORT_FORMAT,
			version: EXPORT_VERSION,
			exportedAt: "2026-10-10T08:00:00.000Z",
			account: { email: alice.email },
		});
		expect(EXPORT_VERSION).toBe(1);
	});

	it("exports every kind of record with readable names and decimal amounts", async () => {
		await seedAlice();
		const doc = await buildExport(alice.id, NOW);
		expect(doc.categories.map((c) => c.name).sort()).toEqual(["Food", "Old"]);
		expect(doc.cards.map((c) => c.name).sort()).toEqual([
			"Daily card",
			"Retired card",
		]);
		expect(doc.cards.find((c) => c.name === "Daily card")).toMatchObject({
			last4: "0000",
			creditLimitMinor: 5_000_000,
			creditLimit: "50000.00",
			archived: false,
		});
		expect(doc.subscriptions.find((s) => s.name === "Streaming")).toMatchObject(
			{
				amountMinor: 64_900,
				amount: "649.00",
				cardName: "Daily card",
				archived: false,
			},
		);
		const refund = doc.transactions.find((t) => t.type === "REFUND");
		expect(refund).toMatchObject({
			amountMinor: 120_000,
			amount: "1200.00",
			categoryName: "Food",
			cardName: "Daily card",
		});
		expect(refund?.refundOfId).toBe(
			doc.transactions.find((t) => t.description === "Groceries")?.id,
		);
		expect(doc.transactions.find((t) => t.currency === "USD")).toMatchObject({
			amount: "25.00",
			occurredOn: "2026-09-20",
		});
		expect(doc.statements[0]).toMatchObject({
			balanceMinor: 1_200_000,
			balance: "12000.00",
			minimumDue: "1200.00",
			paidMinor: 400_000,
			outstandingMinor: 800_000,
			cardName: "Daily card",
			dueDate: "2026-10-20",
		});
		expect(doc.statementPayments).toMatchObject([
			{
				amountMinor: 400_000,
				paidOn: "2026-10-08",
				currency: "NPR",
				notes: "Partial",
			},
		]);
		expect(doc.settings).toMatchObject({
			timezone: "Asia/Kathmandu",
			offsetsDays: [7, 1],
		});
	});

	it("includes archived records and says they are archived", async () => {
		await seedAlice();
		const doc = await buildExport(alice.id, NOW);
		expect(doc.categories.find((c) => c.name === "Old")?.archived).toBe(true);
		expect(doc.cards.find((c) => c.name === "Retired card")?.archived).toBe(
			true,
		);
		expect(doc.subscriptions.find((s) => s.name === "Old sub")?.archived).toBe(
			true,
		);
	});

	it("has no settings section content for a user who never set preferences", async () => {
		expect((await buildExport(alice.id, NOW)).settings).toBeNull();
	});
});

describe("export isolation and secrets", () => {
	it("never contains another user's records, in JSON or in any CSV", async () => {
		await seedAlice();
		await seedBob();
		const doc = await buildExport(alice.id, NOW);
		const json = JSON.stringify(doc);
		for (const marker of ["BOB-", "987654", "777700", bob.email, bob.id]) {
			expect(json).not.toContain(marker);
		}
		for (const entity of Object.keys(CSV_ENTITIES) as CsvEntity[]) {
			const csv = csvForEntity(entity, doc);
			for (const marker of ["BOB-", bob.id]) expect(csv).not.toContain(marker);
		}
		const bobs = await buildExport(bob.id, NOW);
		expect(JSON.stringify(bobs)).not.toContain("Groceries");
		expect(bobs.transactions).toHaveLength(1);
	});

	it("never contains password hashes, session tokens or internal user ids", async () => {
		await seedBob();
		const doc = await buildExport(bob.id, NOW);
		const json = JSON.stringify(doc);
		expect(bobPasswordHash.length).toBeGreaterThan(20);
		expect(json).not.toContain(bobPasswordHash);
		expect(json).not.toContain(BOB_TOKEN);
		expect(json).not.toContain("userId");
		expect(json).not.toMatch(/passw|token|secret/i);
		expect(Object.keys(doc).sort()).toEqual([
			"account",
			"cards",
			"categories",
			"exportedAt",
			"format",
			"settings",
			"statementPayments",
			"statements",
			"subscriptions",
			"transactions",
			"version",
		]);
	});
});

describe("round trip", () => {
	it("reproduces the app's own totals from the exported data alone", async () => {
		const { statementId } = await seedAlice();
		const doc = await buildExport(alice.id, NOW);
		const parsed = JSON.parse(JSON.stringify(doc)) as typeof doc;

		// Spending per currency (expenses minus refunds) from the export vs the transactions service.
		const sums = new Map<
			string,
			{ currency: string; type: "EXPENSE" | "REFUND"; sumMinor: number }
		>();
		for (const t of parsed.transactions) {
			const key = `${t.currency}|${t.type}`;
			const entry = sums.get(key) ?? {
				currency: t.currency,
				type: t.type,
				sumMinor: 0,
			};
			entry.sumMinor += t.amountMinor;
			sums.set(key, entry);
		}
		const fromExport = netByCurrency([...sums.values()]);
		const live = await listTransactions(
			alice.id,
			transactionFiltersSchema.parse({}),
		);
		expect(fromExport).toEqual(live.totals);
		expect(fromExport.find((t) => t.currency === "NPR")).toMatchObject({
			spentMinor: 500_000 + 1_000 + 64_900,
			refundedMinor: 120_000,
		});

		// Monthly commitment from the exported subscriptions.
		const subs = parsed.subscriptions
			.filter((s) => !s.archived && s.status === "ACTIVE")
			.map((s) => ({
				state: "ACTIVE" as const,
				currency: s.currency,
				monthlyEquivalentMinor: monthlyEquivalentMinor(
					s.amountMinor,
					s.intervalCount,
					s.intervalUnit,
				),
			}));
		const liveSubs = await listSubscriptions(alice.id, { today: "2026-10-10" });
		expect(monthlyCommitments(subs)).toEqual(monthlyCommitments(liveSubs));

		// Each statement's outstanding amount, and payments adding up to what was paid.
		const liveStatement = await getStatement(
			alice.id,
			statementId,
			"2026-10-10",
		);
		const exported = parsed.statements.find((s) => s.id === statementId);
		expect(exported?.outstandingMinor).toBe(liveStatement?.outstandingMinor);
		expect(exported?.paidMinor).toBe(
			parsed.statementPayments
				.filter((p) => p.statementId === statementId)
				.reduce((sum, p) => sum + p.amountMinor, 0),
		);
	});
});

describe("CSV rendering of a real export", () => {
	it("has the documented header and one row per record", async () => {
		await seedAlice();
		const doc = await buildExport(alice.id, NOW);
		for (const [entity, def] of Object.entries(CSV_ENTITIES) as [
			CsvEntity,
			(typeof CSV_ENTITIES)[CsvEntity],
		][]) {
			const lines = csvForEntity(entity, doc).trimEnd().split("\r\n");
			expect(lines[0]).toBe(def.columns.join(","));
		}
		const rows = doc.transactions.length;
		expect(csvForEntity("transactions", doc).match(/\r\n/g)).toHaveLength(
			rows + 1,
		);
	});

	it("neutralises a formula-looking description and quotes awkward text", async () => {
		await seedAlice();
		const csv = csvForEntity("transactions", await buildExport(alice.id, NOW));
		expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
		expect(csv).toContain(`"Quote "" and, comma"`);
		expect(csv).not.toMatch(/(^|\r\n|,)=HYPERLINK/);
	});
});
