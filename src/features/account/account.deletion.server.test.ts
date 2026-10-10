import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { prisma } from "#/db";
import { createPaymentMethod } from "#/features/payment-methods/payment-methods.service.server";
import {
	addPayment,
	createStatement,
} from "#/features/statements/statements.service.server";
import { createSubscription } from "#/features/subscriptions/subscriptions.service.server";
import { createTransaction } from "#/features/transactions/transactions.service.server";
import { auth } from "#/lib/auth";
import { handleAuthPost } from "#/lib/auth-guards";
import {
	cardData,
	createUserWithPassword,
	deleteTestUsers,
	signInHeaders,
	subscriptionData,
} from "#/test/helpers";

import { getAccountSummary } from "./account.service.server";

const created: string[] = [];
afterEach(async () => {
	await deleteTestUsers(created.splice(0));
});

/** Every table that has a "userId" column, read from the database so new tables are covered. */
async function ownedTables() {
	const rows = await prisma.$queryRaw<{ table_name: string }[]>`
		select table_name from information_schema.columns
		where table_schema = 'public' and column_name = 'userId'
		order by table_name`;
	return rows.map((r) => r.table_name);
}

async function rowCounts(userId: string) {
	const counts: Record<string, number> = {};
	for (const table of await ownedTables()) {
		if (!/^[a-z_]+$/.test(table))
			throw new Error(`Unexpected table name ${table}`);
		const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
			`select count(*)::int as n from "${table}" where "userId" = $1`,
			userId,
		);
		counts[table] = rows[0]?.n ?? 0;
	}
	const own = await prisma.$queryRaw<{ n: number }[]>`
		select count(*)::int as n from "user" where id = ${userId}`;
	counts.user = own[0]?.n ?? 0;
	return counts;
}

/** A user with at least one row in every table the app keeps per user, and a live session. */
async function userWithEverything() {
	const { user, password } = await createUserWithPassword();
	created.push(user.id);
	const category = await prisma.category.create({
		data: { userId: user.id, name: "Food" },
	});
	const card = await createPaymentMethod(
		user.id,
		cardData({ name: "Daily card" }),
	);
	const sub = await createSubscription(
		user.id,
		subscriptionData({ paymentMethodId: card.id }),
	);
	const expense = await createTransaction(user.id, {
		description: "Lunch",
		amountMinor: 100_000,
		currency: "NPR",
		occurredOn: "2026-10-05",
		categoryId: category.id,
		paymentMethodId: card.id,
		subscriptionId: sub.id,
		refundOfId: null,
		notes: null,
	});
	await createTransaction(user.id, {
		description: "Refund",
		amountMinor: 20_000,
		currency: "NPR",
		occurredOn: "2026-10-06",
		categoryId: category.id,
		paymentMethodId: card.id,
		subscriptionId: null,
		refundOfId: expense.id,
		notes: null,
	});
	const statement = await createStatement(user.id, {
		paymentMethodId: card.id,
		currency: "NPR",
		periodStart: "2026-09-06",
		periodEnd: "2026-10-05",
		dueDate: "2026-10-20",
		statementBalanceMinor: 500_000,
		minimumDueMinor: null,
	});
	await addPayment(user.id, {
		statementId: statement.id,
		currency: "NPR",
		amountMinor: 100_000,
		paidOn: "2026-10-08",
		notes: null,
	});
	await prisma.notificationPreference.create({ data: { userId: user.id } });
	await prisma.notificationLog.create({
		data: {
			userId: user.id,
			kind: "CARD_PAYMENT_DUE",
			entityId: statement.id,
			eventDate: new Date("2026-10-20"),
			offsetDays: 3,
			channel: "email",
			status: "SENT",
		},
	});
	const headers = await signInHeaders(user.email, password);
	return { user, password, headers };
}

describe("owned tables", () => {
	it("are discovered from the database and include every per-user table", async () => {
		expect(await ownedTables()).toEqual([
			"account",
			"card_statement",
			"category",
			"notification_log",
			"notification_preference",
			"payment_method",
			"session",
			"statement_payment",
			"subscription",
			"transaction",
		]);
	});
});

describe("account summary", () => {
	it("counts only the caller's data", async () => {
		const a = await userWithEverything();
		const b = await userWithEverything();
		await createTransaction(b.user.id, {
			description: "Extra",
			amountMinor: 1,
			currency: "NPR",
			occurredOn: "2026-10-05",
			categoryId: null,
			paymentMethodId: null,
			subscriptionId: null,
			refundOfId: null,
			notes: null,
		});
		expect(await getAccountSummary(a.user.id)).toEqual({
			cards: 1,
			subscriptions: 1,
			transactions: 2,
			statements: 1,
			statementPayments: 1,
			categories: 1,
		});
		expect((await getAccountSummary(b.user.id)).transactions).toBe(3);
		expect(await getAccountSummary(randomUUID())).toEqual({
			cards: 0,
			subscriptions: 0,
			transactions: 0,
			statements: 0,
			statementPayments: 0,
			categories: 0,
		});
	});
});

describe("deleting an account", () => {
	it("removes every row the user owns and nothing of anyone else's", async () => {
		const a = await userWithEverything();
		const b = await userWithEverything();
		const beforeA = await rowCounts(a.user.id);
		const beforeB = await rowCounts(b.user.id);
		// The test is only meaningful if the user really has data in every table.
		for (const [table, n] of Object.entries(beforeA))
			expect(n, table).toBeGreaterThan(0);

		const result = await auth.api.deleteUser({
			headers: a.headers,
			body: { password: a.password },
		});
		expect(result.success).toBe(true);

		const afterA = await rowCounts(a.user.id);
		for (const [table, n] of Object.entries(afterA))
			expect(n, `${table} should be empty`).toBe(0);
		expect(await rowCounts(b.user.id)).toEqual(beforeB);
		expect(await auth.api.getSession({ headers: a.headers })).toBeNull();
		expect(await auth.api.getSession({ headers: b.headers })).not.toBeNull();
	});

	it("is refused with a wrong password, changing nothing", async () => {
		const a = await userWithEverything();
		const before = await rowCounts(a.user.id);
		await expect(
			auth.api.deleteUser({
				headers: a.headers,
				body: { password: "definitely-not-it-123" },
			}),
		).rejects.toThrow();
		expect(await rowCounts(a.user.id)).toEqual(before);
		expect(await auth.api.getSession({ headers: a.headers })).not.toBeNull();
	});

	it("is refused over HTTP without a password, even for a brand-new session", async () => {
		const a = await userWithEverything();
		const before = await rowCounts(a.user.id);
		const url = new URL(
			"/api/auth/delete-user",
			process.env.BETTER_AUTH_URL ?? "http://localhost:3100",
		);
		const attempt = (body: unknown) =>
			new Request(url, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: url.origin,
					cookie: a.headers.get("cookie") ?? "",
				},
				body: JSON.stringify(body),
			});
		// Exactly what the /api/auth route runs: guards first, then Better Auth.
		const route = (request: Request) => handleAuthPost(request, auth.handler);

		const noPassword = await route(attempt({}));
		expect(noPassword.status).toBe(400);
		expect(await rowCounts(a.user.id)).toEqual(before);

		const withPassword = await route(attempt({ password: a.password }));
		expect(withPassword.status).toBe(200);
		expect((await rowCounts(a.user.id)).user).toBe(0);
	});

	it("rejects a request with no session at all", async () => {
		await expect(
			auth.api.deleteUser({
				headers: new Headers(),
				body: { password: "whatever-123456" },
			}),
		).rejects.toThrow();
	});
});
