import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "#/db";
import { createPaymentMethod } from "#/features/payment-methods/payment-methods.service.server";
import { createTransaction } from "#/features/transactions/transactions.service.server";
import {
	cardData,
	createUserWithPassword,
	deleteTestUsers,
	signInHeaders,
} from "#/test/helpers";

import { exportDeps } from "./export.deps.server";
import { handleExportRequest } from "./export.handler.server";

// 2026-10-09 20:30Z is already Oct 10 in Kathmandu (UTC+5:45) but still Oct 9 in UTC.
const NOW = new Date("2026-10-09T20:30:00Z");
let alice: { id: string; email: string };
let password: string;

beforeAll(async () => {
	const made = await createUserWithPassword();
	alice = made.user;
	password = made.password;
});
afterAll(async () => {
	await deleteTestUsers([alice.id]);
});
beforeEach(async () => {
	await prisma.transaction.deleteMany({ where: { userId: alice.id } });
	await prisma.paymentMethod.deleteMany({ where: { userId: alice.id } });
	await prisma.notificationPreference.deleteMany({
		where: { userId: alice.id },
	});
});

const as = (userId: string | null) => ({
	getUserId: async () => userId,
	defaultTimezone: "UTC",
	now: NOW,
});
const request = (path: string, headers?: Headers) =>
	new Request(`http://localhost:3100${path}`, { headers });

async function addTransaction() {
	const card = await createPaymentMethod(
		alice.id,
		cardData({ name: "Daily card" }),
	);
	await createTransaction(alice.id, {
		description: "Lunch",
		amountMinor: 45_000,
		currency: "NPR",
		occurredOn: "2026-10-05",
		categoryId: null,
		paymentMethodId: card.id,
		subscriptionId: null,
		refundOfId: null,
		notes: null,
	});
}

describe("without a session", () => {
	it("is rejected with 401, no data and no caching", async () => {
		await addTransaction();
		for (const target of [
			{ type: "json" as const },
			{ type: "csv" as const, entity: "transactions" },
		]) {
			const response = await handleExportRequest(
				request("/api/export/x"),
				target,
				as(null),
			);
			expect(response.status).toBe(401);
			expect(response.headers.get("cache-control")).toBe("no-store");
			const text = await response.text();
			expect(text).not.toContain("Lunch");
			expect(JSON.parse(text)).toEqual({ error: "Unauthorized" });
		}
	});
});

describe("with a session", () => {
	it("downloads JSON as a private attachment named for the user's local date", async () => {
		await addTransaction();
		await prisma.notificationPreference.create({
			data: { userId: alice.id, timezone: "Asia/Kathmandu" },
		});
		const response = await handleExportRequest(
			request("/api/export/json"),
			{ type: "json" },
			as(alice.id),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe(
			"application/json; charset=utf-8",
		);
		expect(response.headers.get("cache-control")).toBe("no-store");
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		expect(response.headers.get("content-disposition")).toBe(
			'attachment; filename="card-ledger-everything-2026-10-10.json"',
		);
		const body = JSON.parse(await response.text());
		expect(body).toMatchObject({ format: "card-ledger-export", version: 1 });
		expect(body.transactions).toHaveLength(1);
	});

	it("uses the instance default time zone for the filename when the user has no preference", async () => {
		const response = await handleExportRequest(
			request("/api/export/json"),
			{ type: "json" },
			as(alice.id),
		);
		expect(response.headers.get("content-disposition")).toContain("2026-10-09"); // UTC default
	});

	it("downloads CSV with a UTF-8 BOM and the documented header", async () => {
		await addTransaction();
		const response = await handleExportRequest(
			request("/api/export/csv/transactions"),
			{ type: "csv", entity: "transactions" },
			as(alice.id),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("content-type")).toBe(
			"text/csv; charset=utf-8",
		);
		expect(response.headers.get("content-disposition")).toBe(
			'attachment; filename="card-ledger-transactions-2026-10-09.csv"',
		);
		// Response.text() drops a leading BOM by design, so check the raw bytes.
		const bytes = new Uint8Array(await response.clone().arrayBuffer());
		expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
		const text = await response.text();
		expect(text.startsWith("id,type,occurredOn,description,")).toBe(true);
		expect(text).toContain("Lunch");
		expect(text).toContain("450.00");
	});

	it("answers 404 for an unknown entity, without leaking data", async () => {
		await addTransaction();
		for (const entity of [
			"users",
			"sessions",
			"..%2Fetc",
			"transactions.csv",
			"",
		]) {
			const response = await handleExportRequest(
				request("/x"),
				{ type: "csv", entity },
				as(alice.id),
			);
			expect(response.status).toBe(404);
			expect(await response.text()).not.toContain("Lunch");
		}
	});
});

describe("through the real Better Auth session", () => {
	it("serves the signed-in user and rejects a request with no cookie", async () => {
		await addTransaction();
		const deps = await exportDeps();
		const headers = await signInHeaders(alice.email, password);

		const ok = await handleExportRequest(
			request("/api/export/csv/transactions", headers),
			{ type: "csv", entity: "transactions" },
			deps,
		);
		expect(ok.status).toBe(200);
		expect(await ok.text()).toContain("Lunch");

		const anonymous = await handleExportRequest(
			request("/api/export/json"),
			{ type: "json" },
			deps,
		);
		expect(anonymous.status).toBe(401);
		const forged = await handleExportRequest(
			request(
				"/api/export/json",
				new Headers({
					cookie: "better-auth.session_token=not-a-real-token.signature",
				}),
			),
			{ type: "json" },
			deps,
		);
		expect(forged.status).toBe(401);
	});
});

describe("a stored time zone that is not valid", () => {
	it("still exports, dating the file in the instance default zone", async () => {
		await prisma.notificationPreference.create({
			data: { userId: alice.id, timezone: "Kathmandu" },
		});
		const response = await handleExportRequest(
			request("/api/export/json"),
			{ type: "json" },
			as(alice.id),
		);
		expect(response.status).toBe(200);
		expect(response.headers.get("Content-Disposition")).toContain("2026-");
	});
});
