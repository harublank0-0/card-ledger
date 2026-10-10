import { spawnSync } from "node:child_process";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "#/db";
import { getDashboard } from "#/features/dashboard/dashboard.service.server";
import { runReminders } from "#/features/notifications/notifications.service.server";
import { auth } from "#/lib/auth";
import { createTestUser, deleteTestUsers, signInHeaders } from "#/test/helpers";
import {
	applyDemoData,
	createDemoUser,
	generateDemoPassword,
} from "./demo.service.server";
import { buildDemoData, DEMO_EMAIL } from "./demo-data";

const today = "2026-10-10";
const data = buildDemoData({ today });
let bystander: { id: string };

beforeAll(async () => {
	bystander = await createTestUser();
	await prisma.paymentMethod.create({
		data: {
			userId: bystander.id,
			name: "Bystander card",
			last4: "0000",
			currency: "NPR",
		},
	});
});
afterEach(async () => {
	await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });
});
afterAll(async () => {
	await prisma.user.deleteMany({ where: { email: DEMO_EMAIL } });
	await deleteTestUsers([bystander.id]);
});

const demoUsers = () => prisma.user.count({ where: { email: DEMO_EMAIL } });

async function counts(userId: string) {
	const where = { userId };
	return {
		cards: await prisma.paymentMethod.count({ where }),
		subscriptions: await prisma.subscription.count({ where }),
		transactions: await prisma.transaction.count({ where }),
		statements: await prisma.cardStatement.count({ where }),
		payments: await prisma.statementPayment.count({ where }),
		categories: await prisma.category.count({ where }),
	};
}

describe("generateDemoPassword", () => {
	it("is long, URL-safe and different every time", () => {
		const a = generateDemoPassword();
		const b = generateDemoPassword();
		expect(a).not.toBe(b);
		expect(a).toMatch(/^[A-Za-z0-9_-]{20,}$/);
	});
});

describe("createDemoUser", () => {
	it("creates one account that can sign in, and replaces it on a re-run", async () => {
		const first = await createDemoUser("first-password-value-1");
		expect(await demoUsers()).toBe(1);
		const headers = await signInHeaders(DEMO_EMAIL, "first-password-value-1");
		expect((await auth.api.getSession({ headers }))?.user.id).toBe(first);

		const second = await createDemoUser("second-password-value-2");
		expect(second).not.toBe(first);
		expect(await demoUsers()).toBe(1);
		await expect(
			signInHeaders(DEMO_EMAIL, "first-password-value-1"),
		).rejects.toThrow();
		await expect(
			signInHeaders(DEMO_EMAIL, "second-password-value-2"),
		).resolves.toBeDefined();
	});
});

describe("applyDemoData", () => {
	it("creates everything described by the dataset", async () => {
		const userId = await createDemoUser("pw-for-apply-test-1");
		const summary = await applyDemoData(userId, data, today);
		expect(summary).toEqual({
			cards: 3,
			subscriptions: 5,
			transactions: data.transactions.length,
			statements: data.statements.length,
			payments: data.statements.reduce((n, s) => n + s.payments.length, 0),
		});
		expect(await counts(userId)).toMatchObject({
			cards: 3,
			subscriptions: 5,
			transactions: data.transactions.length,
			statements: data.statements.length,
			payments: summary.payments,
		});
		expect(
			await prisma.transaction.count({ where: { userId, type: "REFUND" } }),
		).toBe(2);
		expect(
			await prisma.subscription.count({
				where: { userId, status: "CANCELLED" },
			}),
		).toBe(1);
	});

	it("gives a dashboard where every section has something to show", async () => {
		const userId = await createDemoUser("pw-for-dashboard-test-1");
		await applyDemoData(userId, data, today);
		const d = await getDashboard(userId, { today });
		expect(d.spending.length).toBeGreaterThan(0);
		expect(d.byCategory.map((b) => b.currency)).toEqual(["NPR", "USD"]);
		// Streaming, Cloud Storage and News renew; Antivirus has auto-renew off and the gym pass is cancelled.
		expect(d.subscriptions.activeCount).toBe(3);
		expect(d.subscriptions.commitments.map((c) => c.currency)).toEqual([
			"NPR",
			"USD",
		]);
		expect(d.owed.outstanding.length).toBeGreaterThan(0);
		expect(d.owed.overdueCount).toBeGreaterThanOrEqual(1);
		const kinds = new Set(d.upcoming.map((e) => e.kind));
		for (const kind of [
			"STATEMENT_OVERDUE",
			"RENEWAL",
			"CANCEL_BY",
			"EXPIRY",
			"CARD_DUE_DAY",
		] as const) {
			expect(kinds.has(kind), kind).toBe(true);
		}
		expect(d.recent).toHaveLength(5);
		expect(d.counts).toMatchObject({ cards: 3 });
	});

	it("never emails the demo address", async () => {
		const userId = await createDemoUser("pw-for-mail-test-1");
		await applyDemoData(userId, data, today);
		expect(
			(
				await prisma.notificationPreference.findUniqueOrThrow({
					where: { userId },
				})
			).emailEnabled,
		).toBe(false);
		const sent: string[] = [];
		await runReminders({
			mailer: { kind: "console", send: async (m) => void sent.push(m.to) },
			settingsUrl: "http://localhost:3100/settings",
			now: new Date("2026-10-10T05:00:00Z"),
		});
		expect(sent).not.toContain(DEMO_EMAIL);
	});

	it("cascades cleanly when the demo user is deleted", async () => {
		const userId = await createDemoUser("pw-for-cascade-test-1");
		await applyDemoData(userId, data, today);
		await prisma.user.delete({ where: { id: userId } });
		expect(await counts(userId)).toEqual({
			cards: 0,
			subscriptions: 0,
			transactions: 0,
			statements: 0,
			payments: 0,
			categories: 0,
		});
	});
});

describe("the seed script", () => {
	const run = (env: Record<string, string>) =>
		spawnSync("npx", ["tsx", "prisma/seed.ts"], {
			env: { ...process.env, ...env },
			encoding: "utf8",
			timeout: 90_000,
		});

	it("is idempotent, touches only the demo account, and prints a working password", async () => {
		const before = await counts(bystander.id);
		const passwords: string[] = [];
		for (let i = 0; i < 2; i++) {
			const result = run({ NODE_ENV: "development" });
			expect(result.status, result.stderr).toBe(0);
			const match = /password: (\S+)/.exec(result.stdout);
			expect(match).not.toBeNull();
			passwords.push(match?.[1] as string);
		}
		expect(passwords[0]).not.toBe(passwords[1]);
		expect(await demoUsers()).toBe(1);

		const demo = await prisma.user.findFirstOrThrow({
			where: { email: DEMO_EMAIL },
		});
		expect((await counts(demo.id)).transactions).toBeGreaterThanOrEqual(45);
		expect(await counts(bystander.id)).toEqual(before);

		await expect(
			signInHeaders(DEMO_EMAIL, passwords[0] as string),
		).rejects.toThrow();
		await expect(
			signInHeaders(DEMO_EMAIL, passwords[1] as string),
		).resolves.toBeDefined();
	}, 120_000);

	it("refuses production, exits non-zero and changes nothing", async () => {
		await createDemoUser("pw-existing-demo-1");
		const before = await prisma.user.findFirstOrThrow({
			where: { email: DEMO_EMAIL },
		});
		const result = run({ NODE_ENV: "production" });
		expect(result.status).not.toBe(0);
		expect(result.stderr).toContain("Refusing to seed demo data in production");
		expect(result.stdout).not.toContain("password:");
		const after = await prisma.user.findFirstOrThrow({
			where: { email: DEMO_EMAIL },
		});
		expect(after.id).toBe(before.id);
		expect(await counts(after.id)).toEqual(await counts(before.id));
	}, 60_000);

	it("runs in production only when explicitly allowed", async () => {
		const result = run({
			NODE_ENV: "production",
			SEED_ALLOW_PRODUCTION: "true",
		});
		expect(result.status, result.stderr).toBe(0);
		expect(result.stdout).toContain("Demo data created");
	}, 90_000);
});
