import {
	addDays,
	type CalendarDate,
	nextMonthlyOccurrence,
	previousMonthlyOccurrence,
} from "#/lib/calendar-date";

/**
 * Synthetic demo data. Everything here is invented: fictional merchants, fictional issuers and
 * obviously fake last-four digits. It is generated relative to "today" so the dashboard always
 * looks alive, and deterministically (no randomness from the clock) so runs are reproducible.
 */

/** A reserved `.test` address: it can never be a real mailbox. */
export const DEMO_EMAIL = "demo@card-ledger.test";
export const DEMO_NAME = "Demo User";

export type DemoCard = {
	key: string;
	name: string;
	issuer: string;
	last4: string;
	currency: "NPR" | "USD";
	creditLimitMinor: number;
	statementDay: number | null;
	paymentDueDay: number | null;
};

export type DemoSubscription = {
	name: string;
	amountMinor: number;
	currency: "NPR" | "USD";
	intervalCount: number;
	intervalUnit: "WEEK" | "MONTH" | "YEAR";
	anchorDate: CalendarDate;
	cardKey: string | null;
	cancelled: boolean;
	autoRenew: boolean;
	expiresOn: CalendarDate | null;
	cancellationDeadline: CalendarDate | null;
};

export type DemoTransaction = {
	key: string;
	description: string;
	amountMinor: number;
	currency: "NPR" | "USD";
	occurredOn: CalendarDate;
	/** One of the default category names, or null. */
	category: string | null;
	cardKey: string | null;
	subscriptionName: string | null;
	/** Set on refunds: the key of the expense being refunded. */
	refundOfKey: string | null;
};

export type DemoStatement = {
	cardKey: string;
	periodStart: CalendarDate;
	periodEnd: CalendarDate;
	dueDate: CalendarDate;
	balanceMinor: number;
	minimumDueMinor: number | null;
	payments: { amountMinor: number; paidOn: CalendarDate }[];
};

export type DemoData = {
	cards: DemoCard[];
	subscriptions: DemoSubscription[];
	transactions: DemoTransaction[];
	statements: DemoStatement[];
};

const CARD_NAMES = ["Everyday Card", "Travel Card", "Store Card"] as const;
const ISSUERS = [
	"Example Bank",
	"Sample Credit Union",
	"Fictional Retail Finance",
] as const;

const SUBSCRIPTION_NAMES = [
	"Sample Streaming",
	"Example Cloud Storage",
	"Sample News Quarterly",
	"Example Antivirus",
	"Old Gym Pass",
] as const;

const SPENDING = [
	{
		category: "Groceries",
		names: ["Fictional Mart", "Example Greengrocer", "Sample Bakery"],
		range: [60_000, 450_000],
	},
	{
		category: "Dining",
		names: ["Example Cafe", "Sample Diner", "Demo Noodle House"],
		range: [25_000, 220_000],
	},
	{
		category: "Transport",
		names: ["Demo Ride", "Example Fuel Station"],
		range: [15_000, 180_000],
	},
	{
		category: "Bills & Utilities",
		names: ["Sample Power Co", "Example Internet", "Demo Water Works"],
		range: [80_000, 350_000],
	},
	{
		category: "Shopping",
		names: ["Example Store", "Sample Electronics"],
		range: [120_000, 900_000],
	},
	{
		category: "Health",
		names: ["Sample Pharmacy", "Example Clinic"],
		range: [30_000, 250_000],
	},
	{
		category: "Entertainment",
		names: ["Demo Cinema", "Example Concert Hall"],
		range: [40_000, 160_000],
	},
] as const;

const TRAVEL_NAMES = ["Demo Air", "Example Hotel", "Sample Rail"] as const;

/** Every name the demo data may contain; tests make sure nothing else slips in. */
export const FICTIONAL_NAMES: ReadonlySet<string> = new Set([
	...CARD_NAMES,
	...ISSUERS,
	...SUBSCRIPTION_NAMES,
	...TRAVEL_NAMES,
	...SPENDING.flatMap((s) => s.names),
]);

/** Small, fast, deterministic PRNG so the dataset depends only on `today`. */
function mulberry32(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const minDate = (a: CalendarDate, b: CalendarDate) => (a < b ? a : b);
const maxDate = (a: CalendarDate, b: CalendarDate) => (a > b ? a : b);

/** The `count` most recent statement-period ends on a card's statement day, newest first. */
function statementEnds(day: number, today: CalendarDate, count: number) {
	const ends: CalendarDate[] = [];
	let cursor = previousMonthlyOccurrence(day, today);
	for (let i = 0; i < count; i++) {
		ends.push(cursor);
		cursor = previousMonthlyOccurrence(day, addDays(cursor, -1));
	}
	return ends;
}

/** Statement periods for a card: oldest first, contiguous, with due dates after each end. */
function periodsFor(card: DemoCard, today: CalendarDate, count: number) {
	const day = card.statementDay as number;
	const ends = statementEnds(day, today, count + 1); // one extra to find the first start
	const periods = [];
	for (let i = count - 1; i >= 0; i--) {
		const end = ends[i] as CalendarDate;
		const previousEnd = ends[i + 1] as CalendarDate;
		periods.push({
			periodStart: addDays(previousEnd, 1),
			periodEnd: end,
			dueDate: nextMonthlyOccurrence(
				card.paymentDueDay as number,
				addDays(end, 1),
			),
		});
	}
	return periods;
}

export function buildDemoData(input: { today: CalendarDate }): DemoData {
	const { today } = input;
	const random = mulberry32(20261010);
	const between = (min: number, max: number) =>
		Math.floor(min + random() * (max - min + 1));
	const pick = <T>(items: readonly T[]) =>
		items[between(0, items.length - 1)] as T;
	/** Whole 5-rupee steps look like real prices. */
	const price = (min: number, max: number) =>
		Math.round(between(min, max) / 500) * 500;

	const cards: DemoCard[] = [
		{
			key: "everyday",
			name: CARD_NAMES[0],
			issuer: ISSUERS[0],
			last4: "1111",
			currency: "NPR",
			creditLimitMinor: 15_000_000,
			statementDay: 5,
			paymentDueDay: 20,
		},
		{
			key: "travel",
			name: CARD_NAMES[1],
			issuer: ISSUERS[1],
			last4: "2222",
			currency: "USD",
			creditLimitMinor: 300_000,
			statementDay: 12,
			paymentDueDay: 28,
		},
		// No statements recorded: reminders and the dashboard use its monthly due day.
		{
			key: "store",
			name: CARD_NAMES[2],
			issuer: ISSUERS[2],
			last4: "3333",
			currency: "NPR",
			creditLimitMinor: 4_000_000,
			statementDay: null,
			paymentDueDay: 15,
		},
	];

	const subscriptions: DemoSubscription[] = [
		{
			name: SUBSCRIPTION_NAMES[0],
			amountMinor: 64_900,
			currency: "NPR",
			intervalCount: 1,
			intervalUnit: "MONTH",
			anchorDate: addDays(today, -75),
			cardKey: "everyday",
			cancelled: false,
			autoRenew: true,
			expiresOn: null,
			cancellationDeadline: null,
		},
		{
			name: SUBSCRIPTION_NAMES[1],
			amountMinor: 999,
			currency: "USD",
			intervalCount: 1,
			intervalUnit: "MONTH",
			anchorDate: addDays(today, -50),
			cardKey: "travel",
			cancelled: false,
			autoRenew: true,
			expiresOn: null,
			cancellationDeadline: addDays(today, 9),
		},
		{
			name: SUBSCRIPTION_NAMES[2],
			amountMinor: 150_000,
			currency: "NPR",
			intervalCount: 3,
			intervalUnit: "MONTH",
			anchorDate: addDays(today, -40),
			cardKey: "everyday",
			cancelled: false,
			autoRenew: true,
			expiresOn: null,
			cancellationDeadline: null,
		},
		{
			name: SUBSCRIPTION_NAMES[3],
			amountMinor: 360_000,
			currency: "NPR",
			intervalCount: 1,
			intervalUnit: "YEAR",
			anchorDate: addDays(today, -200),
			cardKey: "store",
			cancelled: false,
			autoRenew: false,
			expiresOn: addDays(today, 20),
			cancellationDeadline: null,
		},
		{
			name: SUBSCRIPTION_NAMES[4],
			amountMinor: 250_000,
			currency: "NPR",
			intervalCount: 1,
			intervalUnit: "MONTH",
			anchorDate: addDays(today, -120),
			cardKey: null,
			cancelled: true,
			autoRenew: true,
			expiresOn: null,
			cancellationDeadline: null,
		},
	];

	// The dashboard shows the current month, so some activity is always dated inside it,
	// whatever day of the month it is (on the 1st that simply means "today").
	const monthStart = `${today.slice(0, 7)}-01`;
	const thisMonth = (daysAgo: number) =>
		maxDate(monthStart, addDays(today, -daysAgo));

	const transactions: DemoTransaction[] = [];
	const cardChoices: (string | null)[] = [
		"everyday",
		"everyday",
		"everyday",
		"store",
		"store",
		null,
	];
	for (let i = 0; i < 42; i++) {
		const group = pick(SPENDING);
		transactions.push({
			key: `e${i}`,
			description: pick(group.names),
			amountMinor: price(group.range[0], group.range[1]),
			currency: "NPR",
			occurredOn: addDays(today, -between(0, 89)),
			category: group.category,
			cardKey: pick(cardChoices),
			subscriptionName: null,
			refundOfKey: null,
		});
	}
	for (const [index, daysAgo] of [0, 1, 2, 4].entries()) {
		const t = transactions[index];
		if (t) t.occurredOn = thisMonth(daysAgo);
	}
	// The real charges of a tracked subscription, recorded each month.
	for (const [n, daysAgo] of [5, 35, 65].entries()) {
		transactions.push({
			key: `s${n}`,
			description: SUBSCRIPTION_NAMES[0],
			amountMinor: 64_900,
			currency: "NPR",
			occurredOn: addDays(today, -daysAgo),
			category: "Subscriptions",
			cardKey: "everyday",
			subscriptionName: SUBSCRIPTION_NAMES[0],
			refundOfKey: null,
		});
	}
	// Travel in another currency, never mixed with the rupee totals.
	for (const [n, [name, daysAgo, amount]] of [
		[TRAVEL_NAMES[0], 23, 41_250],
		[TRAVEL_NAMES[1], 21, 28_700],
		[TRAVEL_NAMES[2], 0, 6_400],
	].entries()) {
		transactions.push({
			key: `t${n}`,
			description: name as string,
			amountMinor: amount as number,
			currency: "USD",
			occurredOn: addDays(today, -(daysAgo as number)),
			category: "Travel",
			cardKey: "travel",
			subscriptionName: null,
			refundOfKey: null,
		});
	}

	// Two refunds: a partial one on a shopping purchase and a full one on a meal.
	const refundable = (category: string) =>
		transactions.find((t) => t.category === category && t.refundOfKey === null);
	for (const [category, share] of [
		["Shopping", 0.4],
		["Dining", 1],
	] as const) {
		const original = refundable(category);
		if (!original) continue;
		transactions.push({
			key: `r-${original.key}`,
			description: original.description,
			amountMinor: Math.round((original.amountMinor * share) / 100) * 100,
			currency: original.currency,
			occurredOn: minDate(today, addDays(original.occurredOn, 4)),
			category: original.category,
			cardKey: original.cardKey,
			subscriptionName: null,
			refundOfKey: original.key,
		});
	}

	// Statements: one card with a paid, an overdue (part-paid) and a latest one; one card
	// with a paid and an open one; the third card has none on purpose.
	const everyday = cards[0] as DemoCard;
	const travel = cards[1] as DemoCard;
	type Period = ReturnType<typeof periodsFor>[number];
	const statement = (
		cardKey: string,
		period: Period,
		balanceMinor: number,
		minimumDueMinor: number,
		payment?: { amountMinor: number; paidOn: CalendarDate },
	): DemoStatement => ({
		cardKey,
		...period,
		balanceMinor,
		minimumDueMinor,
		payments: payment ? [payment] : [],
	});
	/** A payment made `days` after `date`, never later than today. */
	const paidOn = (date: CalendarDate, days: number) =>
		minDate(today, addDays(date, days));

	const [e2, e1, e0] = periodsFor(everyday, today, 3) as [
		Period,
		Period,
		Period,
	];
	const [t1, t0] = periodsFor(travel, today, 2) as [Period, Period];
	const statements: DemoStatement[] = [
		statement("everyday", e2, 4_120_000, 206_000, {
			amountMinor: 4_120_000,
			paidOn: paidOn(e2.dueDate, -3),
		}),
		statement("everyday", e1, 2_910_050, 145_500, {
			amountMinor: 1_500_000,
			paidOn: paidOn(e1.periodEnd, 10),
		}),
		statement("everyday", e0, 3_845_000, 192_250),
		statement("travel", t1, 28_700, 1_500, {
			amountMinor: 28_700,
			paidOn: paidOn(t1.dueDate, -2),
		}),
		statement("travel", t0, 41_250, 2_500, {
			amountMinor: 10_000,
			paidOn: paidOn(t0.periodEnd, 5),
		}),
	];

	transactions.sort(
		(a, b) =>
			a.occurredOn.localeCompare(b.occurredOn) || a.key.localeCompare(b.key),
	);
	return {
		cards,
		subscriptions,
		transactions,
		statements: statements as DemoStatement[],
	};
}

/**
 * The seed must never run against a production database by accident. Throws unless the
 * environment is not production, or the operator explicitly allowed it.
 */
export function assertSeedAllowed(input: {
	nodeEnv: string | undefined;
	allowProduction: boolean;
}) {
	if (input.nodeEnv === "production" && !input.allowProduction) {
		throw new Error(
			"Refusing to seed demo data in production. Set SEED_ALLOW_PRODUCTION=true only if you really mean it.",
		);
	}
}
