import { prisma } from "#/db";
import type { CalendarDate } from "#/lib/calendar-date";
import { fromDbDate, toDbDate } from "#/lib/db-dates";
import {
	type BillingUnit,
	monthlyEquivalentMinor,
	type SubscriptionState,
	type SubscriptionStatus,
	subscriptionState,
	upcomingRenewals,
} from "./subscriptions.logic";
import type { SubscriptionData } from "./subscriptions.schemas";

/** Every function takes `userId` first and scopes every query by it. */

export type SubscriptionView = {
	id: string;
	name: string;
	amountMinor: number;
	currency: string;
	intervalCount: number;
	intervalUnit: BillingUnit;
	anchorDate: CalendarDate;
	status: SubscriptionStatus;
	autoRenew: boolean;
	expiresOn: CalendarDate | null;
	cancellationDeadline: CalendarDate | null;
	cancelledOn: CalendarDate | null;
	notes: string | null;
	archived: boolean;
	paymentMethodId: string | null;
	paymentMethod: { id: string; name: string; last4: string } | null;
	/** Derived, never stored. */
	nextRenewal: CalendarDate | null;
	state: SubscriptionState;
	monthlyEquivalentMinor: number;
};

type Row = Awaited<ReturnType<typeof findRows>>[number];

function findRows(userId: string, includeArchived: boolean) {
	return prisma.subscription.findMany({
		where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
		include: {
			paymentMethod: { select: { id: true, name: true, last4: true } },
		},
		orderBy: { name: "asc" },
	});
}

function toView(row: Row, today: CalendarDate): SubscriptionView {
	const rules = {
		status: row.status,
		autoRenew: row.autoRenew,
		expiresOn: row.expiresOn ? fromDbDate(row.expiresOn) : null,
	};
	const recurrence = {
		anchorDate: fromDbDate(row.anchorDate),
		intervalCount: row.intervalCount,
		intervalUnit: row.intervalUnit,
	};
	return {
		id: row.id,
		name: row.name,
		amountMinor: row.amountMinor,
		currency: row.currency,
		intervalCount: row.intervalCount,
		intervalUnit: row.intervalUnit,
		anchorDate: recurrence.anchorDate,
		status: row.status,
		autoRenew: row.autoRenew,
		expiresOn: rules.expiresOn,
		cancellationDeadline: row.cancellationDeadline
			? fromDbDate(row.cancellationDeadline)
			: null,
		cancelledOn: row.cancelledOn ? fromDbDate(row.cancelledOn) : null,
		notes: row.notes,
		archived: row.archivedAt !== null,
		paymentMethodId: row.paymentMethodId,
		paymentMethod: row.paymentMethod,
		nextRenewal: upcomingRenewals(recurrence, rules, today, 1)[0] ?? null,
		state: subscriptionState(rules, today),
		monthlyEquivalentMinor: monthlyEquivalentMinor(
			row.amountMinor,
			row.intervalCount,
			row.intervalUnit,
		),
	};
}

export async function listSubscriptions(
	userId: string,
	options: { today: CalendarDate; includeArchived?: boolean },
) {
	const rows = await findRows(userId, options.includeArchived ?? false);
	return rows.map((row) => toView(row, options.today));
}

export async function getSubscription(
	userId: string,
	id: string,
	today: CalendarDate,
) {
	const row = await prisma.subscription.findFirst({
		where: { id, userId },
		include: {
			paymentMethod: { select: { id: true, name: true, last4: true } },
		},
	});
	return row ? toView(row, today) : null;
}

/** The linked card must belong to the caller and be active (unless it is already linked). */
async function assertCardUsable(
	userId: string,
	paymentMethodId: string | null,
	currentlyLinkedId: string | null = null,
) {
	if (paymentMethodId === null || paymentMethodId === currentlyLinkedId) return;
	const card = await prisma.paymentMethod.findFirst({
		where: { id: paymentMethodId, userId, archivedAt: null },
		select: { id: true },
	});
	if (!card) throw new Error("Payment method not found");
}

function toRowData(data: SubscriptionData) {
	return {
		name: data.name,
		amountMinor: data.amountMinor,
		currency: data.currency,
		intervalCount: data.intervalCount,
		intervalUnit: data.intervalUnit,
		anchorDate: toDbDate(data.anchorDate),
		paymentMethodId: data.paymentMethodId,
		autoRenew: data.autoRenew,
		expiresOn: data.expiresOn ? toDbDate(data.expiresOn) : null,
		cancellationDeadline: data.cancellationDeadline
			? toDbDate(data.cancellationDeadline)
			: null,
		notes: data.notes,
	};
}

export async function createSubscription(
	userId: string,
	data: SubscriptionData,
) {
	await assertCardUsable(userId, data.paymentMethodId);
	return prisma.subscription.create({ data: { ...toRowData(data), userId } });
}

export async function updateSubscription(
	userId: string,
	id: string,
	data: SubscriptionData,
) {
	const existing = await prisma.subscription.findFirst({
		where: { id, userId },
		select: { paymentMethodId: true },
	});
	if (!existing) throw new Error("Subscription not found");
	await assertCardUsable(
		userId,
		data.paymentMethodId,
		existing.paymentMethodId,
	);
	await prisma.subscription.updateMany({
		where: { id, userId },
		data: toRowData(data),
	});
}

/** Cancel keeps the record. `expiresOn` marks the end of the paid period, if known. */
export async function cancelSubscription(
	userId: string,
	id: string,
	options: { today: CalendarDate; expiresOn: CalendarDate | null },
) {
	const { count } = await prisma.subscription.updateMany({
		where: { id, userId },
		data: {
			status: "CANCELLED",
			cancelledOn: toDbDate(options.today),
			...(options.expiresOn ? { expiresOn: toDbDate(options.expiresOn) } : {}),
		},
	});
	if (count === 0) throw new Error("Subscription not found");
}

export async function reactivateSubscription(userId: string, id: string) {
	const { count } = await prisma.subscription.updateMany({
		where: { id, userId },
		data: { status: "ACTIVE", cancelledOn: null },
	});
	if (count === 0) throw new Error("Subscription not found");
}

export async function setSubscriptionArchived(
	userId: string,
	id: string,
	archived: boolean,
) {
	const { count } = await prisma.subscription.updateMany({
		where: { id, userId },
		data: { archivedAt: archived ? new Date() : null },
	});
	if (count === 0) throw new Error("Subscription not found");
}
