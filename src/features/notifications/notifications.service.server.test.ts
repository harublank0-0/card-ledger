import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "#/db";
import { createPaymentMethod } from "#/features/payment-methods/payment-methods.service.server";
import { createSubscription } from "#/features/subscriptions/subscriptions.service.server";
import type { Mailer, MailMessage } from "#/lib/mailer.server";
import {
	cardData,
	createTestUser,
	deleteTestUsers,
	subscriptionData,
} from "#/test/helpers";

import { notificationPreferencesSchema } from "./notifications.schemas";
import {
	getPreferences,
	getUserToday,
	MAX_ATTEMPTS,
	runReminders,
	updatePreferences,
} from "./notifications.service.server";

// 2025-02-25 10:45 in Kathmandu (UTC+5:45). A Jan 28 monthly anchor renews on 2025-02-28: 3 days away.
const NOW = new Date("2025-02-25T05:00:00Z");
const settingsUrl = "http://localhost:3100/settings";

type Sent = MailMessage;
function fakeMailer(options: { failWith?: { code: string } } = {}) {
	const sent: Sent[] = [];
	const mailer: Mailer = {
		kind: "console",
		async send(message) {
			if (options.failWith)
				throw Object.assign(new Error("boom"), options.failWith);
			sent.push(message);
		},
	};
	return { mailer, sent };
}

let alice: { id: string; email: string };
let bob: { id: string; email: string };

const mailsTo = (sent: Sent[], user: { email: string }) =>
	sent.filter((m) => m.to === user.email);

beforeAll(async () => {
	alice = await createTestUser();
	bob = await createTestUser();
});

afterAll(async () => {
	await deleteTestUsers([alice.id, bob.id]);
});

beforeEach(async () => {
	await prisma.notificationLog.deleteMany({
		where: { userId: { in: [alice.id, bob.id] } },
	});
	await prisma.subscription.deleteMany({
		where: { userId: { in: [alice.id, bob.id] } },
	});
	await prisma.paymentMethod.deleteMany({
		where: { userId: { in: [alice.id, bob.id] } },
	});
	await prisma.notificationPreference.deleteMany({
		where: { userId: { in: [alice.id, bob.id] } },
	});
});

const dueSoon = (name: string, over = {}) =>
	subscriptionData({ name, anchorDate: "2025-01-28", ...over });

describe("preferences", () => {
	it("are created lazily with the defaults", async () => {
		const prefs = await getPreferences(alice.id);
		expect(prefs.timezone).toBe("Asia/Kathmandu");
		expect(prefs.offsetsDays).toEqual([7, 3, 1]);
		expect(prefs.emailEnabled).toBe(true);
	});

	it("are per user and decide what 'today' means", async () => {
		await updatePreferences(
			alice.id,
			notificationPreferencesSchema.parse({
				timezone: "America/New_York",
				emailEnabled: true,
				offsetsDays: [1, 7, 7],
				renewalEnabled: true,
				expiryEnabled: true,
				cancellationEnabled: true,
				paymentDueEnabled: true,
			}),
		);
		const late = new Date("2025-02-25T20:30:00Z"); // Feb 26 in Kathmandu, still Feb 25 in New York
		expect(await getUserToday(alice.id, late)).toBe("2025-02-25");
		expect(await getUserToday(bob.id, late)).toBe("2025-02-26");
		expect((await getPreferences(alice.id)).offsetsDays).toEqual([7, 1]);
		expect((await getPreferences(bob.id)).offsetsDays).toEqual([7, 3, 1]);
	});

	it("reject unknown time zones and unsupported days", () => {
		const base = {
			timezone: "Asia/Kathmandu",
			emailEnabled: true,
			offsetsDays: [7],
			renewalEnabled: true,
			expiryEnabled: true,
			cancellationEnabled: true,
			paymentDueEnabled: true,
		};
		expect(notificationPreferencesSchema.safeParse(base).success).toBe(true);
		expect(
			notificationPreferencesSchema.safeParse({
				...base,
				timezone: "Mars/Olympus",
			}).success,
		).toBe(false);
		expect(
			notificationPreferencesSchema.safeParse({ ...base, offsetsDays: [4] })
				.success,
		).toBe(false);
		expect(
			notificationPreferencesSchema.safeParse({ ...base, offsetsDays: [-1] })
				.success,
		).toBe(false);
	});

	it("are constrained in the database too", async () => {
		await getPreferences(alice.id);
		await expect(
			prisma.notificationPreference.update({
				where: { userId: alice.id },
				data: { offsetsDays: [4] },
			}),
		).rejects.toThrow();
	});
});

describe("runReminders", () => {
	it("sends one digest and never repeats it", async () => {
		await createSubscription(alice.id, dueSoon("Streaming"));
		const { mailer, sent } = fakeMailer();

		const first = await runReminders({ mailer, settingsUrl, now: NOW });
		expect(first.sent).toBe(1);
		const mails = mailsTo(sent, alice);
		expect(mails).toHaveLength(1);
		expect(mails[0].subject).toContain("Streaming renews in 3 days");
		expect(mails[0].text).toContain(settingsUrl);

		const log = await prisma.notificationLog.findMany({
			where: { userId: alice.id },
		});
		expect(log).toHaveLength(1);
		expect(log[0]).toMatchObject({
			kind: "SUBSCRIPTION_RENEWAL",
			offsetDays: 3,
			status: "SENT",
			attempts: 0,
		});

		await runReminders({ mailer, settingsUrl, now: NOW });
		await runReminders({
			mailer,
			settingsUrl,
			now: new Date(NOW.getTime() + 3_600_000),
		});
		expect(mailsTo(sent, alice)).toHaveLength(1);
	});

	it("sends the next threshold on a later day (3 days, then 1 day)", async () => {
		await createSubscription(alice.id, dueSoon("Streaming"));
		const { mailer, sent } = fakeMailer();
		await runReminders({ mailer, settingsUrl, now: NOW });
		await runReminders({
			mailer,
			settingsUrl,
			now: new Date("2025-02-27T05:00:00Z"),
		});
		const mails = mailsTo(sent, alice);
		expect(mails).toHaveLength(2);
		expect(mails[1].subject).toContain("renews tomorrow");
	});

	it("does not double-send when two runs overlap", async () => {
		await createSubscription(alice.id, dueSoon("Streaming"));
		const { mailer, sent } = fakeMailer();
		await Promise.all([
			runReminders({ mailer, settingsUrl, now: NOW }),
			runReminders({ mailer, settingsUrl, now: NOW }),
			runReminders({ mailer, settingsUrl, now: NOW }),
		]);
		expect(mailsTo(sent, alice)).toHaveLength(1);
		expect(
			await prisma.notificationLog.count({ where: { userId: alice.id } }),
		).toBe(1);
	});

	it("keeps each user's reminders to themselves", async () => {
		await createSubscription(alice.id, dueSoon("Alice Streaming"));
		await createSubscription(bob.id, dueSoon("Bob Gym"));
		const { mailer, sent } = fakeMailer();
		await runReminders({ mailer, settingsUrl, now: NOW });
		const a = mailsTo(sent, alice);
		const b = mailsTo(sent, bob);
		expect(a).toHaveLength(1);
		expect(b).toHaveLength(1);
		expect(a[0].text).toContain("Alice Streaming");
		expect(a[0].text).not.toContain("Bob Gym");
		expect(b[0].text).toContain("Bob Gym");
		expect(b[0].text).not.toContain("Alice Streaming");
	});

	it("groups several reminders into one email, including card payment due dates", async () => {
		await createSubscription(
			alice.id,
			dueSoon("Streaming", { cancellationDeadline: "2025-02-26" }),
		);
		await createPaymentMethod(
			alice.id,
			cardData({ name: "Daily card", last4: "0000", paymentDueDay: 28 }),
		);
		const { mailer, sent } = fakeMailer();
		await runReminders({ mailer, settingsUrl, now: NOW });
		const mails = mailsTo(sent, alice);
		expect(mails).toHaveLength(1);
		expect(mails[0].subject).toBe("Card Ledger: 3 upcoming reminders");
		expect(mails[0].text).toContain(
			"Daily card •••• 0000 payment is due in 3 days",
		);
		expect(mails[0].text).toContain("Cancel Streaming by 2025-02-26");
	});

	it("skips cancelled and archived subscriptions, and disabled users", async () => {
		const cancelled = await createSubscription(
			alice.id,
			dueSoon("Cancelled one"),
		);
		await prisma.subscription.update({
			where: { id: cancelled.id },
			data: { status: "CANCELLED" },
		});
		const archived = await createSubscription(
			alice.id,
			dueSoon("Archived one"),
		);
		await prisma.subscription.update({
			where: { id: archived.id },
			data: { archivedAt: new Date() },
		});
		await createSubscription(bob.id, dueSoon("Bob Gym"));
		await getPreferences(bob.id);
		await prisma.notificationPreference.update({
			where: { userId: bob.id },
			data: { emailEnabled: false },
		});

		const { mailer, sent } = fakeMailer();
		await runReminders({ mailer, settingsUrl, now: NOW });
		expect(mailsTo(sent, alice)).toHaveLength(0);
		expect(mailsTo(sent, bob)).toHaveLength(0);
	});

	it("respects a user's own time zone for the day", async () => {
		await createSubscription(alice.id, dueSoon("Streaming"));
		await getPreferences(alice.id);
		await prisma.notificationPreference.update({
			where: { userId: alice.id },
			data: { timezone: "Pacific/Kiritimati" },
		}); // UTC+14
		const { mailer, sent } = fakeMailer();
		// 2025-02-25 05:00Z is already Feb 25 19:00 in Kiritimati: still 3 days out, so same bucket.
		await runReminders({ mailer, settingsUrl, now: NOW });
		// Late Feb 26 UTC is Feb 27 in Kiritimati: only 1 day left there.
		await runReminders({
			mailer,
			settingsUrl,
			now: new Date("2025-02-26T12:00:00Z"),
		});
		const subjects = mailsTo(sent, alice).map((m) => m.subject);
		expect(subjects[0]).toContain("in 3 days");
		expect(subjects[1]).toContain("tomorrow");
	});
});

describe("failures and retries", () => {
	it("records a failure, backs off, then retries successfully", async () => {
		await createSubscription(alice.id, dueSoon("Streaming"));
		const failing = fakeMailer({ failWith: { code: "ECONNREFUSED" } });
		const summary = await runReminders({
			mailer: failing.mailer,
			settingsUrl,
			now: NOW,
		});
		expect(summary.failed).toBe(1);

		const failed = await prisma.notificationLog.findFirstOrThrow({
			where: { userId: alice.id },
		});
		expect(failed).toMatchObject({
			status: "FAILED",
			attempts: 1,
			lastError: "ECONNREFUSED",
		});
		expect(failed.nextAttemptAt?.getTime()).toBe(NOW.getTime() + 15 * 60_000);

		const ok = fakeMailer();
		await runReminders({
			mailer: ok.mailer,
			settingsUrl,
			now: new Date(NOW.getTime() + 60_000),
		}); // too early
		expect(ok.sent).toHaveLength(0);

		await runReminders({
			mailer: ok.mailer,
			settingsUrl,
			now: new Date(NOW.getTime() + 16 * 60_000),
		});
		expect(mailsTo(ok.sent, alice)).toHaveLength(1);
		const done = await prisma.notificationLog.findFirstOrThrow({
			where: { userId: alice.id },
		});
		expect(done).toMatchObject({
			status: "SENT",
			attempts: 1,
			lastError: null,
			nextAttemptAt: null,
		});
	});

	it("stops retrying after the maximum number of attempts", async () => {
		await createSubscription(alice.id, dueSoon("Streaming"));
		const failing = fakeMailer({ failWith: { code: "ETIMEDOUT" } });
		const find = () =>
			prisma.notificationLog.findFirstOrThrow({ where: { userId: alice.id } });

		// Retry exactly when each backoff expires (15m, 1h, 4h, 12h): all still inside the 3-day window.
		let at = NOW;
		for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
			await runReminders({ mailer: failing.mailer, settingsUrl, now: at });
			const row = await find();
			expect(row.attempts).toBe(attempt);
			if (attempt < MAX_ATTEMPTS) {
				expect(row.nextAttemptAt).not.toBeNull();
				at = row.nextAttemptAt as Date;
			}
		}
		const exhausted = await find();
		expect(exhausted).toMatchObject({
			status: "FAILED",
			attempts: MAX_ATTEMPTS,
			nextAttemptAt: null,
		});

		// Even with a healthy mailer, an exhausted reminder is not sent again.
		const ok = fakeMailer();
		await runReminders({
			mailer: ok.mailer,
			settingsUrl,
			now: new Date(at.getTime() + 3_600_000),
		});
		expect(mailsTo(ok.sent, alice)).toHaveLength(0);
	});

	it("reclaims a stale pending claim left by a crashed run", async () => {
		await createSubscription(alice.id, dueSoon("Streaming"));
		const sub = await prisma.subscription.findFirstOrThrow({
			where: { userId: alice.id },
		});
		await prisma.notificationLog.create({
			data: {
				userId: alice.id,
				kind: "SUBSCRIPTION_RENEWAL",
				entityId: sub.id,
				eventDate: new Date("2025-02-28T00:00:00Z"),
				offsetDays: 3,
				channel: "email",
				status: "PENDING",
				updatedAt: new Date("2025-02-25T04:00:00Z"),
			},
		});
		const { mailer, sent } = fakeMailer();
		await runReminders({ mailer, settingsUrl, now: NOW });
		expect(mailsTo(sent, alice)).toHaveLength(1);

		// A fresh (not yet stale) claim held by another run is left alone.
		await prisma.notificationLog.updateMany({
			where: { userId: alice.id },
			data: { status: "PENDING", updatedAt: new Date("2025-02-25T04:55:00Z") },
		});
		await runReminders({ mailer, settingsUrl, now: NOW });
		expect(mailsTo(sent, alice)).toHaveLength(1);
	});
});
