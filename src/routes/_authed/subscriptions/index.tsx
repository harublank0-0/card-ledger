import { createFileRoute, Link } from "@tanstack/react-router";
import { cn } from "cn";
import { Clock, Plus, ReceiptText, Repeat } from "lucide-react";
import { z } from "zod";

import { EmptyState, StatusBadge, type Tone } from "#/components/feedback";
import { PageHeader } from "#/components/page-header";
import { Figure, Panel, Stat, StatGroup } from "#/components/panel";
import {
	segmentedGroupClass,
	segmentedItemClass,
} from "#/components/segmented";
import { Button } from "#/components/ui/button";
import {
	rowLinkClass,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { listSubscriptionsFn } from "#/features/subscriptions/subscriptions.functions";
import type { SubscriptionState } from "#/features/subscriptions/subscriptions.logic";
import {
	describeInterval,
	monthlyCommitments,
} from "#/features/subscriptions/subscriptions.logic";
import { diffInDays } from "#/lib/calendar-date";
import type { CurrencyCode } from "#/lib/money";
import { formatMoney } from "#/lib/money";
import { pageTitle } from "#/lib/page-title";

export const Route = createFileRoute("/_authed/subscriptions/")({
	head: pageTitle("Subscriptions"),
	validateSearch: z.object({
		archived: z.boolean().optional().catch(undefined),
	}),
	loaderDeps: ({ search }) => ({ archived: search.archived ?? false }),
	loader: ({ deps }) =>
		listSubscriptionsFn({ data: { includeArchived: deps.archived } }),
	component: Subscriptions,
});

const STATE: Record<SubscriptionState, { label: string; tone: Tone }> = {
	ACTIVE: { label: "Active", tone: "neutral" },
	ENDS_SOON: { label: "Ending soon", tone: "warning" },
	NOT_RENEWING: { label: "Not renewing", tone: "neutral" },
	CANCELLED: { label: "Cancelled", tone: "neutral" },
	EXPIRED: { label: "Expired", tone: "neutral" },
};

/** A cancel-by date this close is a warning. */
const CANCEL_BY_WARNING_DAYS = 7;

function relativeDays(days: number) {
	if (days === 0) return "today";
	if (days === 1) return "tomorrow";
	if (days < 0) return `${-days} day${days === -1 ? "" : "s"} ago`;
	return `in ${days} days`;
}

function Subscriptions() {
	const { today, subscriptions } = Route.useLoaderData();

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
		<div>
			<PageHeader
				title="Subscriptions"
				description="What you pay for regularly, and when it renews next."
				actions={
					<Button asChild>
						<Link to="/subscriptions/new">
							<Plus aria-hidden="true" />
							Add subscription
						</Link>
					</Button>
				}
			/>

			<div className="grid gap-6">
				<StatGroup>
					<Stat label="Active subscriptions">
						<Figure>{renewing.length}</Figure>
					</Stat>
					<Stat label="Monthly commitment (per currency, not combined)">
						{commitments.length === 0 ? (
							<Figure>—</Figure>
						) : (
							<ul className="flex flex-wrap gap-x-8 gap-y-1">
								{commitments.map(({ currency, monthlyMinor }) => (
									<li key={currency}>
										<Figure>
											{formatMoney(monthlyMinor, currency as CurrencyCode)}
										</Figure>
									</li>
								))}
							</ul>
						)}
					</Stat>
				</StatGroup>

				<Panel aria-label="Subscriptions">
					<div className="flex items-center justify-between gap-3 border-b bg-background/50 px-4 py-3 sm:px-5">
						<nav
							aria-label="Which subscriptions"
							className={segmentedGroupClass}
						>
							<Link
								to="/subscriptions"
								search={{}}
								activeOptions={{ exact: true }}
								className={segmentedItemClass}
							>
								Current
							</Link>
							<Link
								to="/subscriptions"
								search={{ archived: true }}
								activeOptions={{ exact: true }}
								className={segmentedItemClass}
							>
								Including archived
							</Link>
						</nav>
					</div>

					{sorted.length === 0 ? (
						<EmptyState
							icon={Repeat}
							title="No subscriptions yet"
							action={
								<Button asChild variant="outline">
									<Link to="/subscriptions/new">Add subscription</Link>
								</Button>
							}
						>
							Add the subscriptions you pay for to see what renews next.
						</EmptyState>
					) : (
						<Table>
							<caption className="sr-only">Subscriptions</caption>
							<TableHeader>
								<TableRow>
									<TableHead>Subscription</TableHead>
									<TableHead className="hidden sm:table-cell">Next</TableHead>
									<TableHead numeric>Amount</TableHead>
									<TableHead className="w-0">
										<span className="sr-only">Actions</span>
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{sorted.map((s) => {
									const deadlineDays = s.cancellationDeadline
										? diffInDays(today, s.cancellationDeadline)
										: null;
									const state = s.archived
										? { label: "Archived", tone: "neutral" as const }
										: STATE[s.state];
									const next = s.nextRenewal ? (
										<>
											Renews{" "}
											<span className="whitespace-nowrap tabular-nums">
												{s.nextRenewal}
											</span>{" "}
											<span className="whitespace-nowrap text-muted-foreground">
												({relativeDays(diffInDays(today, s.nextRenewal))})
											</span>
										</>
									) : s.expiresOn ? (
										<>
											Ends{" "}
											<span className="whitespace-nowrap tabular-nums">
												{s.expiresOn}
											</span>
										</>
									) : null;
									return (
										<TableRow key={s.id} interactive>
											<TableCell className="w-full max-w-0 sm:max-w-none">
												<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
													<Link
														to="/subscriptions/$subscriptionId"
														params={{ subscriptionId: s.id }}
														className={rowLinkClass}
													>
														{s.name}
													</Link>
													{(s.archived || s.state !== "ACTIVE") && (
														<StatusBadge tone={state.tone}>
															{state.label}
														</StatusBadge>
													)}
												</div>
												<p className="mt-0.5 truncate text-xs text-muted-foreground">
													{describeInterval(s.intervalCount, s.intervalUnit)}
													{s.paymentMethod
														? ` · ${s.paymentMethod.name} •••• ${s.paymentMethod.last4}`
														: ""}
												</p>
												{next && (
													<p className="mt-0.5 text-xs sm:hidden">{next}</p>
												)}
												{deadlineDays !== null &&
													deadlineDays >= 0 &&
													s.state === "ACTIVE" && (
														<p
															className={cn(
																"mt-1 flex items-start gap-1 text-xs",
																deadlineDays <= CANCEL_BY_WARNING_DAYS
																	? "font-medium text-warning"
																	: "text-muted-foreground",
															)}
														>
															<Clock
																aria-hidden="true"
																className="mt-px size-3.5 shrink-0"
															/>
															<span>
																Cancel by{" "}
																<span className="tabular-nums">
																	{s.cancellationDeadline}
																</span>{" "}
																({relativeDays(deadlineDays)})
															</span>
														</p>
													)}
											</TableCell>
											<TableCell className="hidden min-w-36 sm:table-cell xl:whitespace-nowrap">
												{next ?? (
													<span className="text-muted-foreground">—</span>
												)}
											</TableCell>
											<TableCell numeric>
												{formatMoney(s.amountMinor, s.currency as CurrencyCode)}
											</TableCell>
											<TableCell className="py-2 pl-1">
												<Button
													asChild
													variant="ghost"
													size="sm"
													className="relative z-10"
												>
													<Link
														to="/transactions/new"
														search={{ subscriptionId: s.id }}
													>
														<ReceiptText aria-hidden="true" />
														<span className="sr-only xl:not-sr-only xl:whitespace-nowrap">
															Record charge
														</span>
														<span className="sr-only">for {s.name}</span>
													</Link>
												</Button>
											</TableCell>
										</TableRow>
									);
								})}
							</TableBody>
						</Table>
					)}
				</Panel>
			</div>
		</div>
	);
}
