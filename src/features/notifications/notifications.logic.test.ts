import { describe, expect, it } from "vitest";

import { renderDigest } from "./notifications.email";
import {
	bucketFor,
	computeReminders,
	type PlannerSubscription,
	type ReminderPrefs,
	reminderKey,
} from "./notifications.logic";

const prefs: ReminderPrefs = {
	offsetsDays: [7, 3, 1],
	renewalEnabled: true,
	expiryEnabled: true,
	cancellationEnabled: true,
	paymentDueEnabled: true,
};

const monthly: PlannerSubscription = {
	id: "11111111-1111-4111-8111-111111111111",
	name: "Streaming",
	amountMinor: 64_900,
	currency: "NPR",
	anchorDate: "2025-01-31",
	intervalCount: 1,
	intervalUnit: "MONTH",
	status: "ACTIVE",
	autoRenew: true,
	expiresOn: null,
	cancellationDeadline: null,
};

const plan = (
	today: string,
	over: Partial<Parameters<typeof computeReminders>[0]> = {},
) =>
	computeReminders({
		today,
		prefs,
		subscriptions: [monthly],
		cards: [],
		...over,
	});

describe("bucketFor", () => {
	it("picks the smallest offset that still covers the days left", () => {
		expect(bucketFor(7, [7, 3, 1])).toBe(7);
		expect(bucketFor(6, [7, 3, 1])).toBe(7);
		expect(bucketFor(3, [7, 3, 1])).toBe(3);
		expect(bucketFor(2, [7, 3, 1])).toBe(3);
		expect(bucketFor(1, [7, 3, 1])).toBe(1);
		expect(bucketFor(0, [7, 3, 1])).toBe(1);
		expect(bucketFor(0, [7, 3, 1, 0])).toBe(0);
		expect(bucketFor(8, [7, 3, 1])).toBeUndefined();
		expect(bucketFor(5, [])).toBeUndefined();
	});
});

describe("computeReminders: subscription renewals", () => {
	it("is silent until the first threshold is reached", () => {
		// Next renewal is 2025-02-28; 2025-02-20 is 8 days away.
		expect(plan("2025-02-20")).toEqual([]);
	});

	it("fires at 7, 3 and 1 days with distinct buckets", () => {
		expect(plan("2025-02-21")[0]).toMatchObject({
			kind: "SUBSCRIPTION_RENEWAL",
			eventDate: "2025-02-28",
			offsetDays: 7,
			daysUntil: 7,
		});
		expect(plan("2025-02-25")[0]).toMatchObject({
			offsetDays: 3,
			daysUntil: 3,
		});
		expect(plan("2025-02-27")[0]).toMatchObject({
			offsetDays: 1,
			daysUntil: 1,
		});
		expect(plan("2025-02-28")[0]).toMatchObject({
			offsetDays: 1,
			daysUntil: 0,
		});
	});

	it("after a missed day yields one reminder in the smaller bucket, not a burst", () => {
		const reminders = plan("2025-02-26"); // 2 days left; the "3 days" run was missed
		expect(reminders).toHaveLength(1);
		expect(reminders[0]).toMatchObject({ offsetDays: 3, daysUntil: 2 });
	});

	it("keeps the same dedupe key for the whole bucket window", () => {
		const a = reminderKey(plan("2025-02-26")[0]);
		const b = reminderKey(plan("2025-02-25")[0]);
		expect(a).toBe(b);
	});

	it("rolls to the next renewal on the day after one passes", () => {
		expect(plan("2025-03-01")).toEqual([]);
		expect(plan("2025-03-24")[0]).toMatchObject({
			eventDate: "2025-03-31",
			offsetDays: 7,
		});
	});

	it("respects the toggle and custom offsets", () => {
		expect(
			plan("2025-02-27", { prefs: { ...prefs, renewalEnabled: false } }),
		).toEqual([]);
		expect(
			plan("2025-02-14", { prefs: { ...prefs, offsetsDays: [14] } })[0],
		).toMatchObject({ offsetDays: 14 });
	});

	it("never reminds for cancelled subscriptions or non-renewing ones", () => {
		expect(
			plan("2025-02-27", {
				subscriptions: [{ ...monthly, status: "CANCELLED" }],
			}),
		).toEqual([]);
		expect(
			plan("2025-02-27", { subscriptions: [{ ...monthly, autoRenew: false }] }),
		).toEqual([]);
	});
});

describe("computeReminders: expiry, cancel-by and card payments", () => {
	it("reminds about expiry and the cancellation deadline", () => {
		const sub = {
			...monthly,
			autoRenew: false,
			expiresOn: "2025-03-10",
			cancellationDeadline: "2025-03-08",
		};
		const kinds = computeReminders({
			today: "2025-03-07",
			prefs,
			subscriptions: [sub],
			cards: [],
		}).map((r) => [r.kind, r.eventDate, r.daysUntil]);
		expect(kinds).toEqual([
			["CANCELLATION_DEADLINE", "2025-03-08", 1],
			["SUBSCRIPTION_EXPIRY", "2025-03-10", 3],
		]);
	});

	it("ignores past dates", () => {
		const sub = {
			...monthly,
			expiresOn: "2025-01-01",
			cancellationDeadline: "2025-01-02",
		};
		const reminders = computeReminders({
			today: "2025-03-07",
			prefs: { ...prefs, renewalEnabled: false },
			subscriptions: [sub],
			cards: [],
		});
		expect(reminders).toEqual([]);
	});

	it("reminds about card payment due days, clamped to month length", () => {
		const card = {
			id: "22222222-2222-4222-8222-222222222222",
			name: "Daily card",
			last4: "0000",
			paymentDueDay: 31,
		};
		const r = computeReminders({
			today: "2025-02-26",
			prefs,
			subscriptions: [],
			cards: [card],
		});
		expect(r).toHaveLength(1);
		expect(r[0]).toMatchObject({
			kind: "CARD_PAYMENT_DUE",
			eventDate: "2025-02-28",
			offsetDays: 3,
			last4: "0000",
		});
		expect(
			computeReminders({
				today: "2025-02-26",
				prefs,
				subscriptions: [],
				cards: [{ ...card, paymentDueDay: null }],
			}),
		).toEqual([]);
		expect(
			computeReminders({
				today: "2025-02-26",
				prefs: { ...prefs, paymentDueEnabled: false },
				subscriptions: [],
				cards: [card],
			}),
		).toEqual([]);
	});
});

describe("renderDigest", () => {
	it("writes a single-reminder subject with the amount", () => {
		const reminders = plan("2025-02-27");
		const { subject, text } = renderDigest({
			reminders,
			timezone: "Asia/Kathmandu",
			settingsUrl: "http://localhost:3100/settings",
		});
		expect(subject).toBe(
			"Reminder: Streaming renews tomorrow, on 2025-02-28 (NPR 649.00)",
		);
		expect(text).toContain("Asia/Kathmandu");
		expect(text).toContain("http://localhost:3100/settings");
	});

	it("groups several reminders into one digest", () => {
		const sub = { ...monthly, cancellationDeadline: "2025-02-28" };
		const reminders = computeReminders({
			today: "2025-02-27",
			prefs,
			subscriptions: [sub],
			cards: [],
		});
		const { subject, text } = renderDigest({
			reminders,
			timezone: "UTC",
			settingsUrl: "x",
		});
		expect(subject).toBe("Card Ledger: 2 upcoming reminders");
		expect(text).toContain("Cancel Streaming by 2025-02-28");
		expect(text).toContain("Streaming renews tomorrow");
	});

	it("refuses to build an empty email", () => {
		expect(() =>
			renderDigest({ reminders: [], timezone: "UTC", settingsUrl: "x" }),
		).toThrow();
	});
});
