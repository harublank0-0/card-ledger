import { describe, expect, it } from "vitest";

import { renderWithRouter } from "#/test/render";

import type { DashboardData } from "../dashboard.types";
import { DashboardView } from "./dashboard-view";

const empty: DashboardData = {
	today: "2025-03-10",
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
};

const tx = (over: object) => ({
	id: "t1",
	type: "EXPENSE" as const,
	amountMinor: 250_000,
	currency: "NPR",
	occurredOn: "2025-03-08",
	description: "Groceries",
	notes: null,
	categoryId: "c1",
	paymentMethodId: "p1",
	subscriptionId: null,
	refundOfId: null,
	category: { id: "c1", name: "Food" },
	paymentMethod: { id: "p1", name: "Daily card", last4: "0000" },
	subscription: null,
	...over,
});

const busy: DashboardData = {
	...empty,
	nextMonth: null,
	spending: [
		{
			currency: "NPR",
			spentMinor: 600_000,
			refundedMinor: 200_000,
			netMinor: 400_000,
		},
		{ currency: "USD", spentMinor: 2_500, refundedMinor: 0, netMinor: 2_500 },
	],
	byCategory: [
		{
			currency: "NPR",
			netMinor: 400_000,
			maxNetMinor: 300_000,
			rows: [
				{
					categoryId: "c1",
					name: "Food",
					spentMinor: 500_000,
					refundedMinor: 200_000,
					netMinor: 300_000,
				},
				{
					categoryId: null,
					name: "Uncategorized",
					spentMinor: 100_000,
					refundedMinor: 0,
					netMinor: 100_000,
				},
			],
		},
		{
			currency: "USD",
			netMinor: 2_500,
			maxNetMinor: 2_500,
			rows: [
				{
					categoryId: "c2",
					name: "Travel",
					spentMinor: 2_500,
					refundedMinor: 0,
					netMinor: 2_500,
				},
			],
		},
	],
	subscriptions: {
		activeCount: 3,
		commitments: [
			{ currency: "NPR", monthlyMinor: 74_900, count: 2 },
			{ currency: "USD", monthlyMinor: 999, count: 1 },
		],
	},
	owed: {
		outstanding: [{ currency: "NPR", outstandingMinor: 500_000 }],
		overdueCount: 1,
	},
	upcoming: [
		{
			kind: "STATEMENT_OVERDUE",
			date: "2025-02-15",
			daysUntil: -23,
			label: "Daily card",
			last4: "0000",
			amountMinor: 100_000,
			currency: "NPR",
			target: { type: "statement", id: "st-old" },
		},
		{
			kind: "RENEWAL",
			date: "2025-03-15",
			daysUntil: 5,
			label: "Streaming",
			amountMinor: 64_900,
			currency: "NPR",
			target: { type: "subscription", id: "sub-1" },
		},
	],
	recent: [
		tx({}),
		tx({
			id: "t2",
			type: "REFUND",
			amountMinor: 50_000,
			description: "Returned shoes",
			category: null,
		}),
	],
	counts: { cards: 1, subscriptions: 3, transactions: 12 },
};

describe("DashboardView: empty account", () => {
	it("explains each empty section and offers the first steps", async () => {
		const html = await renderWithRouter(<DashboardView data={empty} />);
		expect(html).toContain("Get started");
		expect(html).toContain("Add a credit card");
		expect(html).toContain("Track a subscription");
		expect(html).toContain("Record a transaction");
		expect(html).toContain("Nothing recorded this month.");
		expect(html).toContain("Nothing due in the next 30 days.");
		expect(html).toContain("No spending recorded in March 2025.");
		expect(html).toContain("No transactions yet.");
		expect(html).toContain("Nothing owed on recorded statements.");
	});

	it("disables Next on the current month and links Previous to last month", async () => {
		const html = await renderWithRouter(<DashboardView data={empty} />);
		expect(html).toContain("March 2025");
		expect(html).toMatch(/<a[^>]*href="\/\?month=2025-02"[^>]*>Previous<\/a>/);
		expect(html).toMatch(/<button[^>]*disabled[^>]*>Next<\/button>/);
		expect(html).not.toMatch(/<a[^>]*>Next<\/a>/);
	});
});

describe("DashboardView: several currencies", () => {
	it("keeps NPR and USD separate everywhere", async () => {
		const html = await renderWithRouter(<DashboardView data={busy} />);
		expect(html).toContain("NPR 4,000.00");
		expect(html).toContain("USD 25.00");
		expect(html).toContain("NPR 749.00");
		expect(html).toContain("USD 9.99");
		// No invented combined figure (4,000.00 + 25.00, or 749.00 + 9.99).
		for (const combined of ["4,025.00", "758.99"])
			expect(html).not.toContain(combined);
		expect(html).not.toContain("Get started"); // data exists, no onboarding
	});

	it("renders one accessible table per currency with captions and row headers", async () => {
		const html = await renderWithRouter(<DashboardView data={busy} />);
		expect(html.match(/<table/g)).toHaveLength(2);
		expect(html).toContain("NPR, March 2025</caption>");
		expect(html).toContain("USD, March 2025</caption>");
		expect(html).toContain('<th scope="row"');
		expect(html).toContain('<th scope="col">Category</th>');
		expect(html).toContain("refunded NPR 2,000.00");
		// The decorative bars are hidden from assistive tech; the numbers are real text.
		expect(html).toContain('aria-hidden="true"');
		expect(html).toContain("NPR 3,000.00");
	});

	it("lists overdue payments before upcoming renewals, with links to the right pages", async () => {
		const html = await renderWithRouter(<DashboardView data={busy} />);
		const overdueAt = html.indexOf("payment overdue by 23 days");
		const renewalAt = html.indexOf("Streaming renews in 5 days");
		expect(overdueAt).toBeGreaterThan(-1);
		expect(renewalAt).toBeGreaterThan(overdueAt);
		expect(html).toContain('href="/statements/st-old"');
		expect(html).toContain('href="/subscriptions/sub-1"');
		expect(html).toContain("1 overdue");
	});

	it("shows refunds in recent transactions as negative with a badge", async () => {
		const html = await renderWithRouter(<DashboardView data={busy} />);
		expect(html).toContain("Returned shoes");
		expect(html).toContain("Refund</span>");
		expect(html).toMatch(/-NPR 500\.00/);
		expect(html).toContain('href="/transactions/t2"');
	});

	it("offers Next for a past month", async () => {
		const html = await renderWithRouter(
			<DashboardView
				data={{
					...busy,
					month: "2025-02",
					previousMonth: "2025-01",
					nextMonth: "2025-03",
					isCurrentMonth: false,
				}}
			/>,
		);
		expect(html).toContain("February 2025");
		expect(html).toMatch(/<a[^>]*href="\/\?month=2025-03"[^>]*>Next<\/a>/);
	});
});
