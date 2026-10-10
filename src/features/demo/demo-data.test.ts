import { describe, expect, it } from "vitest";

import { DEFAULT_CATEGORY_NAMES } from "#/features/categories/categories.logic";
import { periodsOverlap } from "#/features/statements/statements.logic";
import { isValidCalendarDate } from "#/lib/calendar-date";
import { CURRENCIES, MAX_MINOR } from "#/lib/money";

import {
	assertSeedAllowed,
	buildDemoData,
	DEMO_EMAIL,
	FICTIONAL_NAMES,
} from "./demo-data";

const today = "2026-10-10";
const data = buildDemoData({ today });

describe("buildDemoData: determinism", () => {
	it("is identical for the same day and differs only in dates for another", () => {
		expect(buildDemoData({ today })).toEqual(data);
		const other = buildDemoData({ today: "2027-02-27" });
		expect(
			other.transactions.map((t) => [t.description, t.amountMinor]),
		).toEqual(data.transactions.map((t) => [t.description, t.amountMinor]));
		expect(other.transactions[0]?.occurredOn).not.toBe(
			data.transactions[0]?.occurredOn,
		);
	});
});

describe("buildDemoData: shape", () => {
	it("is big enough to make the app look alive", () => {
		expect(data.cards).toHaveLength(3);
		expect(data.subscriptions).toHaveLength(5);
		expect(data.transactions.length).toBeGreaterThanOrEqual(45);
		expect(data.statements.length).toBeGreaterThanOrEqual(4);
		expect(new Set(data.transactions.map((t) => t.currency))).toEqual(
			new Set(["NPR", "USD"]),
		);
		expect(data.transactions.filter((t) => t.refundOfKey)).toHaveLength(2);
	});

	it("covers the interesting states", () => {
		expect(data.subscriptions.some((s) => s.cancelled)).toBe(true);
		expect(
			data.subscriptions.some(
				(s) => s.cancellationDeadline && s.cancellationDeadline > today,
			),
		).toBe(true);
		expect(
			data.subscriptions.some(
				(s) => s.expiresOn && s.expiresOn > today && !s.autoRenew,
			),
		).toBe(true);
		const owed = (s: (typeof data.statements)[number]) =>
			s.balanceMinor - s.payments.reduce((n, p) => n + p.amountMinor, 0);
		expect(data.statements.some((s) => owed(s) === 0)).toBe(true); // paid
		expect(data.statements.some((s) => owed(s) > 0 && s.dueDate < today)).toBe(
			true,
		); // overdue
		// A card with no statements exercises the due-day fallback.
		const withStatements = new Set(data.statements.map((s) => s.cardKey));
		expect(
			data.cards.some(
				(c) => !withStatements.has(c.key) && c.paymentDueDay !== null,
			),
		).toBe(true);
	});
});

describe("buildDemoData: invariants the app's own rules would enforce", () => {
	it("uses supported currencies and sane positive integer amounts", () => {
		const amounts = [
			...data.transactions.map((t) => [t.currency, t.amountMinor] as const),
			...data.subscriptions.map((s) => [s.currency, s.amountMinor] as const),
			...data.cards.map((c) => [c.currency, c.creditLimitMinor] as const),
		];
		for (const [currency, minor] of amounts) {
			expect(Object.hasOwn(CURRENCIES, currency)).toBe(true);
			expect(Number.isInteger(minor) && minor > 0 && minor <= MAX_MINOR).toBe(
				true,
			);
		}
	});

	it("never dates a recorded transaction or payment in the future, and all dates are valid", () => {
		for (const t of data.transactions) {
			expect(isValidCalendarDate(t.occurredOn)).toBe(true);
			expect(t.occurredOn <= today).toBe(true);
		}
		for (const s of data.statements) {
			for (const date of [s.periodStart, s.periodEnd, s.dueDate])
				expect(isValidCalendarDate(date)).toBe(true);
			for (const p of s.payments) {
				expect(isValidCalendarDate(p.paidOn)).toBe(true);
				expect(p.paidOn <= today).toBe(true);
				expect(p.paidOn >= s.periodEnd).toBe(true);
			}
		}
	});

	it("only refunds real expenses, in the same currency, within the original amount", () => {
		const byKey = new Map(data.transactions.map((t) => [t.key, t]));
		const refunded = new Map<string, number>();
		for (const refund of data.transactions.filter((t) => t.refundOfKey)) {
			const original = byKey.get(refund.refundOfKey as string);
			expect(original).toBeDefined();
			expect(original?.refundOfKey).toBeNull();
			expect(refund.currency).toBe(original?.currency);
			expect(refund.occurredOn >= (original?.occurredOn as string)).toBe(true);
			refunded.set(
				original?.key as string,
				(refunded.get(original?.key as string) ?? 0) + refund.amountMinor,
			);
		}
		for (const [key, total] of refunded)
			expect(total).toBeLessThanOrEqual(byKey.get(key)?.amountMinor as number);
	});

	it("has statements that are well formed, in the card's currency and never overlap", () => {
		const cardByKey = new Map(data.cards.map((c) => [c.key, c]));
		for (const s of data.statements) {
			expect(cardByKey.has(s.cardKey)).toBe(true);
			expect(s.periodStart <= s.periodEnd).toBe(true);
			expect(s.dueDate >= s.periodEnd).toBe(true);
			if (s.minimumDueMinor !== null)
				expect(s.minimumDueMinor).toBeLessThanOrEqual(s.balanceMinor);
			expect(cardByKey.get(s.cardKey)?.statementDay).not.toBeNull();
		}
		for (const card of data.cards) {
			const periods = data.statements
				.filter((s) => s.cardKey === card.key)
				.map((s) => ({ start: s.periodStart, end: s.periodEnd }));
			for (let i = 0; i < periods.length; i++) {
				for (let j = i + 1; j < periods.length; j++) {
					expect(periodsOverlap(periods[i] as never, periods[j] as never)).toBe(
						false,
					);
				}
			}
		}
	});

	it("references only things that exist", () => {
		const cardKeys = new Set(data.cards.map((c) => c.key));
		const subscriptionNames = new Set(data.subscriptions.map((s) => s.name));
		for (const t of data.transactions) {
			if (t.cardKey) expect(cardKeys.has(t.cardKey)).toBe(true);
			if (t.subscriptionName)
				expect(subscriptionNames.has(t.subscriptionName)).toBe(true);
			if (t.category)
				expect(
					(DEFAULT_CATEGORY_NAMES as readonly string[]).includes(t.category),
				).toBe(true);
		}
		for (const s of data.subscriptions)
			if (s.cardKey) expect(cardKeys.has(s.cardKey)).toBe(true);
	});
});

describe("buildDemoData: nothing real", () => {
	it("uses only fictional names", () => {
		const names = [
			...data.cards.flatMap((c) => [c.name, c.issuer]),
			...data.subscriptions.map((s) => s.name),
			...data.transactions.map((t) => t.description),
		];
		for (const name of names)
			expect(FICTIONAL_NAMES.has(name), name).toBe(true);
	});

	it("stores only fake last-four digits and never a long number", () => {
		for (const card of data.cards) {
			expect(card.last4).toMatch(/^\d{4}$/);
			expect(["1111", "2222", "3333"]).toContain(card.last4);
		}
		expect(JSON.stringify(data)).not.toMatch(/\d{9,}/);
		expect(DEMO_EMAIL.endsWith(".test")).toBe(true);
	});
});

describe("assertSeedAllowed", () => {
	it("refuses production unless explicitly allowed", () => {
		expect(() =>
			assertSeedAllowed({ nodeEnv: "production", allowProduction: false }),
		).toThrow(/production/);
		expect(() =>
			assertSeedAllowed({ nodeEnv: "production", allowProduction: true }),
		).not.toThrow();
	});
	it("allows development, test and unset environments", () => {
		for (const nodeEnv of ["development", "test", undefined]) {
			expect(() =>
				assertSeedAllowed({ nodeEnv, allowProduction: false }),
			).not.toThrow();
		}
	});
});

describe("buildDemoData: looks alive and stays valid on any day", () => {
	const days = [
		"2026-10-01",
		"2026-10-10",
		"2026-10-31",
		"2026-12-31",
		"2028-02-29",
		"2027-03-01",
	];

	it.each(
		days,
	)("on %s the current month has spending in both currencies", (day) => {
		const d = buildDemoData({ today: day });
		const month = day.slice(0, 7);
		const inMonth = d.transactions.filter(
			(t) => t.occurredOn.startsWith(month) && t.refundOfKey === null,
		);
		expect(
			inMonth.filter((t) => t.currency === "NPR").length,
		).toBeGreaterThanOrEqual(3);
		expect(
			inMonth.filter((t) => t.currency === "USD").length,
		).toBeGreaterThanOrEqual(1);
	});

	it.each(
		days,
	)("on %s every date is valid, in the past, and refunds and statements stay valid", (day) => {
		const d = buildDemoData({ today: day });
		const byKey = new Map(d.transactions.map((t) => [t.key, t]));
		for (const t of d.transactions) {
			expect(isValidCalendarDate(t.occurredOn)).toBe(true);
			expect(t.occurredOn <= day).toBe(true);
			if (t.refundOfKey) {
				const original = byKey.get(t.refundOfKey);
				expect(original?.currency).toBe(t.currency);
				expect(t.amountMinor).toBeLessThanOrEqual(
					original?.amountMinor as number,
				);
				expect(t.occurredOn >= (original?.occurredOn as string)).toBe(true);
			}
		}
		for (const s of d.statements) {
			expect(s.periodStart <= s.periodEnd && s.periodEnd <= s.dueDate).toBe(
				true,
			);
			for (const p of s.payments) {
				expect(p.paidOn >= s.periodEnd && p.paidOn <= day).toBe(true);
			}
		}
		for (const s of d.subscriptions) {
			if (s.expiresOn) expect(s.expiresOn >= s.anchorDate).toBe(true);
		}
	});
});
