import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";

import { Button } from "#/components/ui/button";
import { listSubscriptionsFn } from "#/features/subscriptions/subscriptions.functions";
import type { SubscriptionState } from "#/features/subscriptions/subscriptions.logic";
import {
	describeInterval,
	monthlyCommitments,
} from "#/features/subscriptions/subscriptions.logic";
import { diffInDays } from "#/lib/calendar-date";
import type { CurrencyCode } from "#/lib/money";
import { formatMoney } from "#/lib/money";

export const Route = createFileRoute("/_authed/subscriptions/")({
	validateSearch: z.object({
		archived: z.boolean().optional().catch(undefined),
	}),
	loaderDeps: ({ search }) => ({ archived: search.archived ?? false }),
	loader: ({ deps }) =>
		listSubscriptionsFn({ data: { includeArchived: deps.archived } }),
	component: Subscriptions,
});

const STATE_LABEL: Record<SubscriptionState, string> = {
	ACTIVE: "Active",
	ENDS_SOON: "Ending soon",
	NOT_RENEWING: "Not renewing",
	CANCELLED: "Cancelled",
	EXPIRED: "Expired",
};

function relativeDays(days: number) {
	if (days === 0) return "today";
	if (days === 1) return "tomorrow";
	if (days < 0) return `${-days} day${days === -1 ? "" : "s"} ago`;
	return `in ${days} days`;
}

function Subscriptions() {
	const { today, subscriptions } = Route.useLoaderData();
	const { archived = false } = Route.useSearch();

	const live = subscriptions.filter((s) => !s.archived);
	const renewing = live.filter((s) => s.state === "ACTIVE");
	const commitments = monthlyCommitments(live);

	const sorted = [...subscriptions].sort((a, b) => {
		// Upcoming renewals first (soonest first), then everything else by name.
		if (a.nextRenewal && b.nextRenewal)
			return a.nextRenewal.localeCompare(b.nextRenewal);
		if (a.nextRenewal) return -1;
		if (b.nextRenewal) return 1;
		return a.name.localeCompare(b.name);
	});

	return (
		<section>
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-2xl font-semibold">Subscriptions</h1>
				<div className="flex items-center gap-2">
					<Button asChild variant="ghost" size="sm">
						<Link
							to="/subscriptions"
							search={{ archived: archived ? undefined : true }}
						>
							{archived ? "Hide archived" : "Show archived"}
						</Link>
					</Button>
					<Button asChild>
						<Link to="/subscriptions/new">Add subscription</Link>
					</Button>
				</div>
			</div>

			<div className="mb-6 grid gap-3 sm:grid-cols-3">
				<div className="rounded-xl border bg-card p-4 shadow-sm">
					<p className="text-xs text-muted-foreground">Active subscriptions</p>
					<p className="text-2xl font-semibold">{renewing.length}</p>
				</div>
				<div className="rounded-xl border bg-card p-4 shadow-sm sm:col-span-2">
					<p className="text-xs text-muted-foreground">
						Monthly commitment (per currency, not combined)
					</p>
					{commitments.length === 0 ? (
						<p className="text-2xl font-semibold">—</p>
					) : (
						<ul className="flex flex-wrap gap-x-6 gap-y-1">
							{commitments.map(({ currency, monthlyMinor }) => (
								<li key={currency} className="text-2xl font-semibold">
									{formatMoney(monthlyMinor, currency as CurrencyCode)}
								</li>
							))}
						</ul>
					)}
				</div>
			</div>

			{sorted.length === 0 ? (
				<div className="rounded-xl border bg-card p-8 text-center">
					<p className="font-medium">No subscriptions yet</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Add the subscriptions you pay for to see what renews next.
					</p>
				</div>
			) : (
				<ul className="grid gap-3">
					{sorted.map((s) => {
						const deadlineDays = s.cancellationDeadline
							? diffInDays(today, s.cancellationDeadline)
							: null;
						return (
							<li
								key={s.id}
								className="rounded-xl border bg-card p-4 shadow-sm"
							>
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div className="min-w-0">
										<p className="font-medium">
											<Link
												to="/subscriptions/$subscriptionId"
												params={{ subscriptionId: s.id }}
												className="hover:underline"
											>
												{s.name}
											</Link>
											<span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
												{s.archived ? "Archived" : STATE_LABEL[s.state]}
											</span>
										</p>
										<p className="text-sm text-muted-foreground">
											{describeInterval(s.intervalCount, s.intervalUnit)}
											{s.paymentMethod
												? ` · ${s.paymentMethod.name} •••• ${s.paymentMethod.last4}`
												: ""}
										</p>
									</div>
									<div className="text-right">
										<p className="font-medium">
											{formatMoney(s.amountMinor, s.currency as CurrencyCode)}
										</p>
										{s.nextRenewal ? (
											<p className="text-sm text-muted-foreground">
												Renews {s.nextRenewal} (
												{relativeDays(diffInDays(today, s.nextRenewal))})
											</p>
										) : s.expiresOn ? (
											<p className="text-sm text-muted-foreground">
												Ends {s.expiresOn}
											</p>
										) : null}
									</div>
								</div>
								{deadlineDays !== null &&
									deadlineDays >= 0 &&
									s.state === "ACTIVE" && (
										<p
											className={`mt-2 text-sm ${deadlineDays <= 7 ? "font-medium text-destructive" : "text-muted-foreground"}`}
										>
											Cancel by {s.cancellationDeadline} (
											{relativeDays(deadlineDays)})
										</p>
									)}
								<div className="mt-2">
									<Button asChild variant="outline" size="sm">
										<Link
											to="/transactions/new"
											search={{ subscriptionId: s.id }}
										>
											Record charge
										</Link>
									</Button>
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
