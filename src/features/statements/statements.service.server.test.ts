import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "#/db";
import {
	createPaymentMethod,
	updatePaymentMethod,
} from "#/features/payment-methods/payment-methods.service.server";
import { transactionFiltersSchema } from "#/features/transactions/transactions.schemas";
import { listTransactions } from "#/features/transactions/transactions.service.server";
import { cardData, createTestUser, deleteTestUsers } from "#/test/helpers";

import {
	type PaymentData,
	paymentInputSchema,
	type StatementData,
	statementInputSchema,
} from "./statements.schemas";
import {
	addPayment,
	createStatement,
	deletePayment,
	deleteStatement,
	getStatement,
	getStatementDefaults,
	listStatements,
	updateStatement,
} from "./statements.service.server";

const today = "2025-03-10";
let alice: { id: string };
let bob: { id: string };
let card: { id: string };

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
	await prisma.paymentMethod.deleteMany({ where });
	card = await createPaymentMethod(
		alice.id,
		cardData({ name: "Daily card", statementDay: 5, paymentDueDay: 20 }),
	);
});

function stmt(over: Partial<StatementData> = {}): StatementData {
	return {
		paymentMethodId: card.id,
		currency: "NPR",
		periodStart: "2025-02-06",
		periodEnd: "2025-03-05",
		dueDate: "2025-03-20",
		statementBalanceMinor: 100_000,
		minimumDueMinor: 10_000,
		...over,
	};
}
const pay = (
	statementId: string,
	over: Partial<PaymentData> = {},
): PaymentData => ({
	statementId,
	currency: "NPR",
	amountMinor: 40_000,
	paidOn: "2025-03-12",
	notes: null,
	...over,
});
const view = (userId: string, id: string, on = today) =>
	getStatement(userId, id, on);

describe("creating statements", () => {
	it("stores the statement with derived values", async () => {
		const { id } = await createStatement(alice.id, stmt());
		expect(await view(alice.id, id)).toMatchObject({
			periodStart: "2025-02-06",
			periodEnd: "2025-03-05",
			dueDate: "2025-03-20",
			currency: "NPR",
			balanceMinor: 100_000,
			minimumDueMinor: 10_000,
			paidMinor: 0,
			outstandingMinor: 100_000,
			overpaidMinor: 0,
			status: "OPEN",
			daysUntilDue: 10,
			card: { name: "Daily card" },
			payments: [],
		});
	});

	it("must be in the card's currency", async () => {
		await expect(
			createStatement(alice.id, stmt({ currency: "USD" })),
		).rejects.toThrow("card's currency (NPR)");
	});

	it("needs the caller's own, active card", async () => {
		const theirs = await createPaymentMethod(bob.id, cardData());
		await expect(
			createStatement(alice.id, stmt({ paymentMethodId: theirs.id })),
		).rejects.toThrow("Payment method not found");
		await prisma.paymentMethod.update({
			where: { id: card.id },
			data: { archivedAt: new Date() },
		});
		await expect(createStatement(alice.id, stmt())).rejects.toThrow(
			"Payment method not found",
		);
	});

	it("keeps existing statements visible after the card is archived", async () => {
		const { id } = await createStatement(alice.id, stmt());
		await prisma.paymentMethod.update({
			where: { id: card.id },
			data: { archivedAt: new Date() },
		});
		expect((await view(alice.id, id))?.card.archived).toBe(true);
		expect(
			(await listStatements(alice.id, { includePaid: true, today })).statements,
		).toHaveLength(1);
	});

	it("rejects an identical or overlapping period but allows back-to-back ones", async () => {
		await createStatement(alice.id, stmt());
		await expect(createStatement(alice.id, stmt())).rejects.toThrow(
			"already has a statement",
		);
		await expect(
			createStatement(
				alice.id,
				stmt({
					periodStart: "2025-03-01",
					periodEnd: "2025-04-05",
					dueDate: "2025-04-20",
				}),
			),
		).rejects.toThrow("2025-02-06 to 2025-03-05");
		await expect(
			createStatement(
				alice.id,
				stmt({
					periodStart: "2025-03-06",
					periodEnd: "2025-04-05",
					dueDate: "2025-04-20",
				}),
			),
		).resolves.toBeDefined();
		await expect(
			createStatement(
				alice.id,
				stmt({
					periodStart: "2025-01-06",
					periodEnd: "2025-02-05",
					dueDate: "2025-02-20",
				}),
			),
		).resolves.toBeDefined();
	});

	it("allows the same period on a different card", async () => {
		const other = await createPaymentMethod(
			alice.id,
			cardData({ name: "Other" }),
		);
		await createStatement(alice.id, stmt());
		await expect(
			createStatement(alice.id, stmt({ paymentMethodId: other.id })),
		).resolves.toBeDefined();
	});

	it("never lets simultaneous overlapping creates both succeed", async () => {
		const results = await Promise.allSettled([
			createStatement(
				alice.id,
				stmt({ periodStart: "2025-02-06", periodEnd: "2025-03-05" }),
			),
			createStatement(
				alice.id,
				stmt({
					periodStart: "2025-02-20",
					periodEnd: "2025-03-20",
					dueDate: "2025-04-01",
				}),
			),
			createStatement(
				alice.id,
				stmt({
					periodStart: "2025-03-01",
					periodEnd: "2025-03-31",
					dueDate: "2025-04-10",
				}),
			),
		]);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		expect(
			await prisma.cardStatement.count({ where: { userId: alice.id } }),
		).toBe(1);
	});
});

describe("reading statements", () => {
	it("never returns another user's statement", async () => {
		const { id } = await createStatement(alice.id, stmt());
		await addPayment(alice.id, pay(id));
		expect(await view(bob.id, id)).toBeNull();
		expect(await view(alice.id, id)).not.toBeNull();
	});
});

describe("updating statements", () => {
	it("changes balance and dates, and may keep its own period", async () => {
		const { id } = await createStatement(alice.id, stmt());
		await updateStatement(
			alice.id,
			id,
			stmt({ statementBalanceMinor: 150_000, dueDate: "2025-03-25" }),
		);
		expect(await view(alice.id, id)).toMatchObject({
			balanceMinor: 150_000,
			dueDate: "2025-03-25",
		});
	});

	it("cannot move onto another statement's period, change card or currency, or be edited by another user", async () => {
		const a = await createStatement(alice.id, stmt());
		const b = await createStatement(
			alice.id,
			stmt({
				periodStart: "2025-03-06",
				periodEnd: "2025-04-05",
				dueDate: "2025-04-20",
			}),
		);
		await expect(
			updateStatement(
				alice.id,
				b.id,
				stmt({
					periodStart: "2025-03-01",
					periodEnd: "2025-04-05",
					dueDate: "2025-04-20",
				}),
			),
		).rejects.toThrow("already has a statement");
		const other = await createPaymentMethod(
			alice.id,
			cardData({ name: "Other" }),
		);
		await expect(
			updateStatement(alice.id, a.id, stmt({ paymentMethodId: other.id })),
		).rejects.toThrow("card cannot be changed");
		await expect(
			updateStatement(alice.id, a.id, stmt({ currency: "USD" })),
		).rejects.toThrow("card's currency");
		await expect(
			updateStatement(bob.id, a.id, stmt({ statementBalanceMinor: 1 })),
		).rejects.toThrow("Statement not found");
		expect((await view(alice.id, a.id))?.balanceMinor).toBe(100_000);
	});
});

describe("payments", () => {
	it("handles partial, exact and over payment", async () => {
		const { id } = await createStatement(alice.id, stmt());
		await addPayment(alice.id, pay(id, { amountMinor: 40_000 }));
		expect(await view(alice.id, id)).toMatchObject({
			paidMinor: 40_000,
			outstandingMinor: 60_000,
			overpaidMinor: 0,
			status: "OPEN",
		});

		await addPayment(alice.id, pay(id, { amountMinor: 60_000 }));
		expect(await view(alice.id, id)).toMatchObject({
			paidMinor: 100_000,
			outstandingMinor: 0,
			overpaidMinor: 0,
			status: "PAID",
		});

		await addPayment(alice.id, pay(id, { amountMinor: 25_000 }));
		expect(await view(alice.id, id)).toMatchObject({
			paidMinor: 125_000,
			outstandingMinor: 0,
			overpaidMinor: 25_000,
			status: "PAID",
		});
	});

	it("shows an unpaid statement as overdue after its due date, and paid ones never", async () => {
		const { id } = await createStatement(alice.id, stmt());
		expect(await view(alice.id, id, "2025-03-21")).toMatchObject({
			status: "OVERDUE",
			daysUntilDue: -1,
		});
		await addPayment(alice.id, pay(id, { amountMinor: 100_000 }));
		expect((await view(alice.id, id, "2025-03-21"))?.status).toBe("PAID");
	});

	it("must be in the statement's currency", async () => {
		const { id } = await createStatement(alice.id, stmt());
		await expect(
			addPayment(alice.id, pay(id, { currency: "USD" })),
		).rejects.toThrow("statement's currency (NPR)");
		expect((await view(alice.id, id))?.paidMinor).toBe(0);
	});

	it("cannot be added to, or deleted from, another user's statement", async () => {
		const { id } = await createStatement(alice.id, stmt());
		await expect(addPayment(bob.id, pay(id))).rejects.toThrow(
			"Statement not found",
		);
		const mine = await addPayment(alice.id, pay(id));
		await expect(deletePayment(bob.id, mine.id)).rejects.toThrow(
			"Payment not found",
		);
		expect((await view(alice.id, id))?.paidMinor).toBe(40_000);
	});

	it("can be deleted, restoring the outstanding amount", async () => {
		const { id } = await createStatement(alice.id, stmt());
		const p = await addPayment(alice.id, pay(id, { amountMinor: 100_000 }));
		await deletePayment(alice.id, p.id);
		expect(await view(alice.id, id)).toMatchObject({
			paidMinor: 0,
			outstandingMinor: 100_000,
			status: "OPEN",
		});
	});

	it("are never counted as spending or turned into transactions", async () => {
		const { id } = await createStatement(alice.id, stmt());
		await addPayment(alice.id, pay(id, { amountMinor: 100_000 }));
		expect(
			await prisma.transaction.count({ where: { userId: alice.id } }),
		).toBe(0);
		const spending = await listTransactions(
			alice.id,
			transactionFiltersSchema.parse({}),
		);
		expect(spending.total).toBe(0);
		expect(spending.totals).toEqual([]);
	});
});

describe("deleting statements", () => {
	it("is blocked while payments exist, then allowed", async () => {
		const { id } = await createStatement(alice.id, stmt());
		const p = await addPayment(alice.id, pay(id));
		await expect(deleteStatement(alice.id, id)).rejects.toThrow(
			"payments first",
		);
		await deletePayment(alice.id, p.id);
		await expect(deleteStatement(alice.id, id)).resolves.toBeUndefined();
		expect(await view(alice.id, id)).toBeNull();
	});

	it("cannot be done by another user", async () => {
		const { id } = await createStatement(alice.id, stmt());
		await expect(deleteStatement(bob.id, id)).rejects.toThrow(
			"Statement not found",
		);
		expect(await view(alice.id, id)).not.toBeNull();
	});
});

describe("listing", () => {
	it("puts unpaid statements first by due date, hides paid ones by default, and totals per currency", async () => {
		const usd = await createPaymentMethod(
			alice.id,
			cardData({ name: "Travel", currency: "USD" }),
		);
		const feb = await createStatement(
			alice.id,
			stmt({
				periodStart: "2025-01-06",
				periodEnd: "2025-02-05",
				dueDate: "2025-02-20",
			}),
		);
		await addPayment(alice.id, pay(feb.id, { amountMinor: 100_000 }));
		const mar = await createStatement(
			alice.id,
			stmt({ statementBalanceMinor: 80_000, minimumDueMinor: null }),
		);
		await addPayment(alice.id, pay(mar.id, { amountMinor: 30_000 }));
		const apr = await createStatement(
			alice.id,
			stmt({
				periodStart: "2025-03-06",
				periodEnd: "2025-04-05",
				dueDate: "2025-04-20",
				statementBalanceMinor: 20_000,
				minimumDueMinor: null,
			}),
		);
		const travel = await createStatement(alice.id, {
			...stmt({
				paymentMethodId: usd.id,
				currency: "USD",
				statementBalanceMinor: 9_900,
				minimumDueMinor: null,
			}),
		});

		const open = await listStatements(alice.id, { includePaid: false, today });
		expect(open.statements.map((s) => s.id)).toEqual([
			mar.id,
			travel.id,
			apr.id,
		]);
		expect(open.outstanding).toEqual([
			{ currency: "NPR", outstandingMinor: 50_000 + 20_000 },
			{ currency: "USD", outstandingMinor: 9_900 },
		]);

		const all = await listStatements(alice.id, { includePaid: true, today });
		expect(all.statements.map((s) => s.id)).toEqual([
			mar.id,
			travel.id,
			apr.id,
			feb.id,
		]);

		const onlyTravel = await listStatements(alice.id, {
			cardId: usd.id,
			includePaid: true,
			today,
		});
		expect(onlyTravel.statements.map((s) => s.id)).toEqual([travel.id]);
	});

	it("never includes another user's statements", async () => {
		const theirs = await createPaymentMethod(bob.id, cardData());
		await createStatement(bob.id, stmt({ paymentMethodId: theirs.id }));
		expect(
			await listStatements(alice.id, { includePaid: true, today }),
		).toEqual({ statements: [], outstanding: [] });
	});
});

describe("defaults for a new statement", () => {
	it("suggests the next period from the card's days and the latest statement", async () => {
		expect(
			(await getStatementDefaults(alice.id, card.id, today))?.suggestion,
		).toEqual({
			periodStart: "2025-02-06",
			periodEnd: "2025-03-05",
			dueDate: "2025-03-20",
		});
		await createStatement(alice.id, stmt());
		expect(
			(await getStatementDefaults(alice.id, card.id, today))?.suggestion,
		).toEqual({
			periodStart: "2025-03-06",
			periodEnd: "2025-04-05",
			dueDate: "2025-04-20",
		});
	});
	it("only works for the caller's active cards", async () => {
		const theirs = await createPaymentMethod(bob.id, cardData());
		// "Not yours" and "does not exist" look the same, and neither is an error: the route
		// turns null into not-found, so a real failure is not mistaken for a missing card.
		await expect(
			getStatementDefaults(alice.id, theirs.id, today),
		).resolves.toBeNull();
		await expect(
			getStatementDefaults(
				alice.id,
				"01a1265d-0980-72ad-a375-fcae3345ef5a",
				today,
			),
		).resolves.toBeNull();
	});
});

describe("card currency guard", () => {
	it("blocks changing a card's currency once it has statements", async () => {
		await expect(
			updatePaymentMethod(alice.id, card.id, cardData({ currency: "USD" })),
		).resolves.toBeDefined();
		await updatePaymentMethod(alice.id, card.id, cardData({ currency: "NPR" }));
		await createStatement(alice.id, stmt());
		await expect(
			updatePaymentMethod(alice.id, card.id, cardData({ currency: "USD" })),
		).rejects.toThrow("while this card has statements");
		await expect(
			updatePaymentMethod(
				alice.id,
				card.id,
				cardData({ name: "Renamed", currency: "NPR" }),
			),
		).resolves.toBeDefined();
	});
});

describe("database guards", () => {
	const base = (userId: string, paymentMethodId: string) => ({
		userId,
		paymentMethodId,
		currency: "NPR",
		periodStart: new Date("2025-02-06"),
		periodEnd: new Date("2025-03-05"),
		dueDate: new Date("2025-03-20"),
		statementBalanceMinor: 1000,
	});

	it("rejects bad rows even if validation is bypassed", async () => {
		const bad = (over: object) =>
			prisma.cardStatement.create({
				data: { ...base(alice.id, card.id), ...over },
			});
		await expect(bad({ statementBalanceMinor: -1 })).rejects.toThrow();
		await expect(bad({ minimumDueMinor: 2000 })).rejects.toThrow();
		await expect(bad({ periodEnd: new Date("2025-02-01") })).rejects.toThrow();
		await expect(bad({ dueDate: new Date("2025-03-01") })).rejects.toThrow();
		await expect(bad({ currency: "npr" })).rejects.toThrow();
		const ok = await bad({});
		await expect(
			prisma.statementPayment.create({
				data: {
					userId: alice.id,
					statementId: ok.id,
					amountMinor: 0,
					paidOn: new Date("2025-03-12"),
				},
			}),
		).rejects.toThrow();
	});

	it("cascades cleanly when a user is deleted, but blocks deleting a card or statement on its own", async () => {
		const carol = await createTestUser();
		const carolCard = await createPaymentMethod(carol.id, cardData());
		const s = await createStatement(
			carol.id,
			stmt({ paymentMethodId: carolCard.id }),
		);
		await addPayment(carol.id, pay(s.id));
		await expect(
			prisma.paymentMethod.delete({ where: { id: carolCard.id } }),
		).rejects.toThrow();
		await expect(
			prisma.cardStatement.delete({ where: { id: s.id } }),
		).rejects.toThrow();
		await prisma.user.delete({ where: { id: carol.id } });
		expect(
			await prisma.cardStatement.count({ where: { userId: carol.id } }),
		).toBe(0);
		expect(
			await prisma.statementPayment.count({ where: { userId: carol.id } }),
		).toBe(0);
	});
});

describe("input schemas", () => {
	const validStatement = {
		paymentMethodId: "11111111-1111-4111-8111-111111111111",
		currency: "NPR",
		periodStart: "2025-02-06",
		periodEnd: "2025-03-05",
		dueDate: "2025-03-20",
		balance: "1,250.50",
		minimumDue: "",
	};
	it("normalises a statement", () => {
		expect(statementInputSchema.parse(validStatement)).toMatchObject({
			statementBalanceMinor: 125_050,
			minimumDueMinor: null,
		});
		expect(
			statementInputSchema.parse({ ...validStatement, balance: "0" })
				.statementBalanceMinor,
		).toBe(0);
	});
	it.each([
		["end before start", { periodEnd: "2025-02-01" }],
		["due before the period ends", { dueDate: "2025-03-01" }],
		["minimum above balance", { minimumDue: "2000" }],
		["a bad balance", { balance: "abc" }],
		["a negative balance", { balance: "-5" }],
		["a missing balance", { balance: "" }],
		["a bad date", { periodStart: "2025-02-30" }],
		["a non-uuid card", { paymentMethodId: "x" }],
	])("rejects %s", (_l, patch) => {
		expect(
			statementInputSchema.safeParse({ ...validStatement, ...patch }).success,
		).toBe(false);
	});
	it("validates payments", () => {
		const ok = {
			statementId: "11111111-1111-4111-8111-111111111111",
			currency: "NPR",
			amount: "400",
			paidOn: "2025-03-12",
			notes: "",
		};
		expect(paymentInputSchema.parse(ok)).toMatchObject({
			amountMinor: 40_000,
			notes: null,
		});
		for (const patch of [
			{ amount: "0" },
			{ amount: "1.234" },
			{ paidOn: "nope" },
			{ currency: "XXX" },
		]) {
			expect(paymentInputSchema.safeParse({ ...ok, ...patch }).success).toBe(
				false,
			);
		}
	});
});
