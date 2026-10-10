import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

import { prisma } from "#/db";
import { createSubscription } from "#/features/subscriptions/subscriptions.service.server";
import type { Mailer, MailMessage } from "#/lib/mailer.server";
import {
	createTestUser,
	deleteTestUsers,
	subscriptionData,
} from "#/test/helpers";

import { runReminders } from "./notifications.service.server";

// A fault injected into the pure planner for exactly one user (the one who owns a
// subscription named "Broken plan"). The run must report it and carry on with everyone else.
vi.mock("./notifications.logic", async (importOriginal) => {
	const original =
		await importOriginal<typeof import("./notifications.logic")>();
	return {
		...original,
		computeReminders: (
			input: Parameters<typeof original.computeReminders>[0],
		) => {
			if (input.subscriptions.some((s) => s.name === "Broken plan")) {
				throw new Error("planner failed for one user");
			}
			return original.computeReminders(input);
		},
	};
});

const NOW = new Date("2025-02-25T05:00:00Z");
let broken: { id: string; email: string };
let healthy: { id: string; email: string };

function collectingMailer() {
	const sent: MailMessage[] = [];
	const mailer: Mailer = {
		kind: "console",
		async send(message) {
			sent.push(message);
		},
	};
	return { mailer, sent };
}

beforeAll(async () => {
	// Created in this order so the failing user is processed first.
	broken = await createTestUser();
	healthy = await createTestUser();
});
afterAll(async () => {
	await deleteTestUsers([broken.id, healthy.id]);
});
beforeEach(async () => {
	const ids = [broken.id, healthy.id];
	await prisma.notificationLog.deleteMany({ where: { userId: { in: ids } } });
	await prisma.subscription.deleteMany({ where: { userId: { in: ids } } });
	await prisma.notificationPreference.deleteMany({
		where: { userId: { in: ids } },
	});
});

describe("reminder run isolation", () => {
	it("reports a failure for one user and still serves the rest", async () => {
		await createSubscription(
			broken.id,
			subscriptionData({ name: "Broken plan", anchorDate: "2025-01-28" }),
		);
		await createSubscription(
			healthy.id,
			subscriptionData({ name: "Healthy plan", anchorDate: "2025-01-28" }),
		);
		const { mailer, sent } = collectingMailer();

		const summary = await runReminders({
			mailer,
			settingsUrl: "http://localhost:3100/settings",
			now: NOW,
		});

		expect(summary.failed).toBe(1);
		expect(sent.filter((m) => m.to === healthy.email)).toHaveLength(1);
		expect(sent.filter((m) => m.to === broken.email)).toHaveLength(0);
	});
});
