import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import {
	CalendarClock,
	CircleAlert,
	Clock,
	CreditCard,
	type LucideIcon,
	Plus,
	Repeat,
} from "lucide-react";
import type { ReactNode } from "react";

import { StatusBadge } from "#/components/feedback";
import { PageHeader } from "#/components/page-header";
import {
	Figure,
	Panel,
	PanelHeader,
	Stat,
	StatGroup,
} from "#/components/panel";
import { Button } from "#/components/ui/button";
import { signedAmount } from "#/features/transactions/transactions.logic";
import { type CurrencyCode, formatMoney } from "#/lib/money";
import {
	barPercent,
	describeUpcoming,
	formatMonthLabel,
	UPCOMING_HORIZON_DAYS,
	type UpcomingEvent,
} from "../dashboard.logic";
import type { DashboardData } from "../dashboard.types";

const money = (minor: number, currency: string) =>
	formatMoney(minor, currency as CurrencyCode);

const MAX_UPCOMING = 10;
/** A cancel-by date this close is a warning, not just a reminder. */
const CANCEL_BY_WARNING_DAYS = 7;

const linkClass =
	"font-medium text-foreground underline decoration-border-strong underline-offset-4 transition-[color,background-color,border-color,text-decoration-color] hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function EventLink({
	event,
	className,
	children,
}: {
	event: UpcomingEvent;
	className?: string;
	children: ReactNode;
}) {
	switch (event.target.type) {
		case "subscription":
			return (
				<Link
					to="/subscriptions/$subscriptionId"
					params={{ subscriptionId: event.target.id }}
					className={className}
				>
					{children}
				</Link>
			);
		case "statement":
			return (
				<Link
					to="/statements/$statementId"
					params={{ statementId: event.target.id }}
					className={className}
				>
					{children}
				</Link>
			);
		case "card":
			return (
				<Link
					to="/statements/new"
					search={{ cardId: event.target.id }}
					className={className}
				>
					{children}
				</Link>
			);
	}
}

const KIND_ICON: Record<UpcomingEvent["kind"], LucideIcon> = {
	STATEMENT_OVERDUE: CircleAlert,
	STATEMENT_DUE: CreditCard,
	CARD_DUE_DAY: CreditCard,
	CANCEL_BY: Clock,
	RENEWAL: Repeat,
	EXPIRY: CalendarClock,
};

function eventTone(event: UpcomingEvent, tone: "danger" | "neutral") {
	if (tone === "danger") return "danger";
	if (event.kind === "CANCEL_BY" && event.daysUntil <= CANCEL_BY_WARNING_DAYS)
		return "warning";
	return "neutral";
}

const ICON_TONE = {
	danger: "bg-destructive-soft text-destructive",
	warning: "bg-warning-soft text-warning",
	neutral: "bg-secondary text-muted-foreground",
} as const;

function MonthSwitcher({ data }: { data: DashboardData }) {
	return (
		<nav
			aria-label="Month"
			className="flex items-center rounded-lg border bg-card p-0.5 shadow-xs"
		>
			<Button asChild variant="ghost" size="sm" className="h-7 px-2.5">
				<Link to="/" search={{ month: data.previousMonth }}>
					Previous
				</Link>
			</Button>
			<span
				className="min-w-30 px-2 text-center text-sm font-semibold text-foreground"
				aria-live="polite"
			>
				{formatMonthLabel(data.month)}
			</span>
			{data.nextMonth ? (
				<Button asChild variant="ghost" size="sm" className="h-7 px-2.5">
					<Link to="/" search={{ month: data.nextMonth }}>
						Next
					</Link>
				</Button>
			) : (
				<Button variant="ghost" size="sm" className="h-7 px-2.5" disabled>
					Next
				</Button>
			)}
		</nav>
	);
}

export function DashboardView({ data }: { data: DashboardData }) {
	const monthLabel = formatMonthLabel(data.month);
	const showHints =
		data.counts.cards === 0 ||
		data.counts.subscriptions === 0 ||
		data.counts.transactions === 0;
	const upcoming = data.upcoming.slice(0, MAX_UPCOMING);

	return (
		<div>
			<PageHeader
				title="Dashboard"
				actions={
					<>
						<MonthSwitcher data={data} />
						<Button asChild>
							<Link to="/transactions/new">
								<Plus aria-hidden="true" />
								Add transaction
							</Link>
						</Button>
					</>
				}
			/>

			<div className="grid gap-6">
				{showHints && (
					<Panel aria-labelledby="hints-title">
						<PanelHeader
							id="hints-title"
							title="Get started"
							description="A few records are all it takes to fill this page."
						/>
						<ul className="grid divide-y text-sm sm:grid-cols-3 sm:divide-x sm:divide-y-0">
							{data.counts.cards === 0 && (
								<li className="px-4 py-3.5 sm:px-5">
									<Link to="/cards/new" className={linkClass}>
										Add a credit card
									</Link>
									<p className="text-muted-foreground">
										(only the last four digits are stored)
									</p>
								</li>
							)}
							{data.counts.subscriptions === 0 && (
								<li className="px-4 py-3.5 sm:px-5">
									<Link to="/subscriptions/new" className={linkClass}>
										Track a subscription
									</Link>
									<p className="text-muted-foreground">
										to see what renews next
									</p>
								</li>
							)}
							{data.counts.transactions === 0 && (
								<li className="px-4 py-3.5 sm:px-5">
									<Link to="/transactions/new" className={linkClass}>
										Record a transaction
									</Link>
									<p className="text-muted-foreground">
										to see where your money goes
									</p>
								</li>
							)}
						</ul>
					</Panel>
				)}

				<StatGroup>
					<Stat labelId="spent-title" label={`Spent in ${monthLabel}`}>
						{data.spending.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								Nothing recorded this month.
							</p>
						) : (
							data.spending.map((t) => (
								<div key={t.currency} className="not-first:mt-2">
									<Figure>{money(t.netMinor, t.currency)}</Figure>
									<p className="text-xs text-muted-foreground tabular-nums">
										Spent {money(t.spentMinor, t.currency)}
										{t.refundedMinor > 0 &&
											`, refunded ${money(t.refundedMinor, t.currency)}`}
									</p>
								</div>
							))
						)}
					</Stat>

					<Stat
						labelId="owed-title"
						label="Owed on cards"
						footer={
							data.owed.overdueCount > 0 ? (
								<Link
									to="/statements"
									className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-destructive"
								>
									<StatusBadge tone="danger">
										{data.owed.overdueCount} overdue
									</StatusBadge>
								</Link>
							) : (
								<Link to="/statements" className={linkClass}>
									View statements
								</Link>
							)
						}
					>
						{data.owed.outstanding.length === 0 ? (
							<p className="text-sm text-muted-foreground">
								Nothing owed on recorded statements.
							</p>
						) : (
							data.owed.outstanding.map((o) => (
								<Figure key={o.currency}>
									{money(o.outstandingMinor, o.currency)}
								</Figure>
							))
						)}
					</Stat>

					<Stat
						labelId="subs-title"
						label="Subscriptions"
						footer={
							<Link to="/subscriptions" className={linkClass}>
								Manage subscriptions
							</Link>
						}
					>
						<Figure>
							{data.subscriptions.activeCount}
							<span className="ml-1.5 text-sm font-normal text-muted-foreground">
								active
							</span>
						</Figure>
						{data.subscriptions.commitments.length === 0 ? (
							<p className="text-xs text-muted-foreground">
								No monthly commitment yet.
							</p>
						) : (
							data.subscriptions.commitments.map((c) => (
								<p key={c.currency} className="text-sm tabular-nums">
									<span className="font-medium">
										{money(c.monthlyMinor, c.currency)}
									</span>
									<span className="text-muted-foreground"> per month</span>
								</p>
							))
						)}
					</Stat>
				</StatGroup>

				<div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
					<div className="grid gap-6">
						<Panel aria-labelledby="recent-title">
							<PanelHeader
								id="recent-title"
								title="Recent transactions"
								actions={
									<Button asChild variant="ghost" size="sm">
										<Link to="/transactions">View all</Link>
									</Button>
								}
							/>
							{data.recent.length === 0 ? (
								<p className="px-4 py-6 text-sm text-muted-foreground sm:px-5">
									No transactions yet.
								</p>
							) : (
								<ul className="divide-y">
									{data.recent.map((t) => (
										<li
											key={t.id}
											className="relative flex items-start gap-3 px-4 py-3 transition-[color,background-color,border-color,text-decoration-color] hover:bg-background/80 sm:gap-4 sm:px-5"
										>
											<span className="hidden w-[5.5rem] shrink-0 pt-px text-sm whitespace-nowrap text-muted-foreground tabular-nums sm:block">
												{t.occurredOn}
											</span>
											<div className="min-w-0 flex-1">
												<p className="flex flex-wrap items-center gap-x-2 gap-y-1">
													<Link
														to="/transactions/$transactionId"
														params={{ transactionId: t.id }}
														className="font-medium text-foreground outline-none after:absolute after:inset-0 hover:underline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring"
													>
														{t.description}
													</Link>
													{t.type === "REFUND" && (
														<StatusBadge>Refund</StatusBadge>
													)}
												</p>
												<p className="truncate text-xs text-muted-foreground">
													<span className="tabular-nums sm:hidden">
														{t.occurredOn} ·{" "}
													</span>
													{t.category?.name ?? "Uncategorized"}
													{t.paymentMethod
														? ` · ${t.paymentMethod.name} •••• ${t.paymentMethod.last4}`
														: ""}
												</p>
											</div>
											<span
												className={cn(
													"shrink-0 font-medium whitespace-nowrap tabular-nums",
													t.type === "REFUND" && "text-success",
												)}
											>
												{money(signedAmount(t.type, t.amountMinor), t.currency)}
											</span>
										</li>
									))}
								</ul>
							)}
						</Panel>

						<Panel aria-labelledby="upcoming-title">
							<PanelHeader
								id="upcoming-title"
								title="Coming up"
								description={`Next ${UPCOMING_HORIZON_DAYS} days, overdue first`}
							/>
							{upcoming.length === 0 ? (
								<p className="px-4 py-6 text-sm text-muted-foreground sm:px-5">
									Nothing due in the next {UPCOMING_HORIZON_DAYS} days.
								</p>
							) : (
								<ul className="divide-y">
									{upcoming.map((event) => {
										const { text, tone } = describeUpcoming(event);
										const shown = eventTone(event, tone);
										const Icon = KIND_ICON[event.kind];
										return (
											<li
												key={`${event.kind}-${event.target.id}-${event.date}`}
												className="relative flex items-start gap-3 px-4 py-3 transition-[color,background-color,border-color,text-decoration-color] hover:bg-background/80 sm:px-5"
											>
												<span
													className={cn(
														"mt-px flex size-7 shrink-0 items-center justify-center rounded-full",
														ICON_TONE[shown],
													)}
												>
													<Icon aria-hidden="true" className="size-3.5" />
												</span>
												<div className="min-w-0 flex-1">
													<EventLink
														event={event}
														className={cn(
															"outline-none after:absolute after:inset-0 hover:underline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring",
															shown === "danger"
																? "font-medium text-destructive"
																: "text-foreground",
														)}
													>
														{text}
													</EventLink>
													<p className="text-xs text-muted-foreground tabular-nums">
														{event.date}
													</p>
												</div>
												{event.amountMinor !== undefined && event.currency && (
													<span className="shrink-0 pt-px font-medium whitespace-nowrap tabular-nums">
														{money(event.amountMinor, event.currency)}
													</span>
												)}
											</li>
										);
									})}
								</ul>
							)}
							{data.upcoming.length > MAX_UPCOMING && (
								<p className="border-t px-4 py-2.5 text-xs text-muted-foreground sm:px-5">
									Showing the first {MAX_UPCOMING} of {data.upcoming.length}.
								</p>
							)}
						</Panel>
					</div>

					<Panel aria-labelledby="categories-title">
						<PanelHeader
							id="categories-title"
							title="Spending by category"
							description={monthLabel}
						/>
						{data.byCategory.length === 0 ? (
							<p className="px-4 py-6 text-sm text-muted-foreground sm:px-5">
								No spending recorded in {monthLabel}.
							</p>
						) : (
							<div className="grid divide-y">
								{data.byCategory.map((breakdown) => (
									<table key={breakdown.currency} className="w-full text-sm">
										<caption className="px-4 pt-4 pb-1 text-left text-xs font-medium text-muted-foreground sm:px-5">
											{breakdown.currency}, {monthLabel}
										</caption>
										<thead className="sr-only">
											<tr>
												<th scope="col">Category</th>
												<th scope="col">Net spending</th>
											</tr>
										</thead>
										<tbody>
											{breakdown.rows.map((row) => (
												<tr key={row.categoryId ?? "uncategorized"}>
													<th
														scope="row"
														className="w-full py-2 pr-3 pl-4 text-left font-normal sm:pl-5"
													>
														<span className="block text-foreground">
															{row.name}
														</span>
														<span
															aria-hidden="true"
															className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-secondary"
														>
															<span
																className="block h-full rounded-full bg-[#3d4a5e]"
																style={{
																	width: `${barPercent(row.netMinor, breakdown.maxNetMinor)}%`,
																}}
															/>
														</span>
													</th>
													<td className="py-2 pr-4 text-right align-top font-medium whitespace-nowrap tabular-nums sm:pr-5">
														{money(row.netMinor, breakdown.currency)}
														{row.refundedMinor > 0 && (
															<span className="block text-xs font-normal text-muted-foreground">
																refunded{" "}
																{money(row.refundedMinor, breakdown.currency)}
															</span>
														)}
													</td>
												</tr>
											))}
										</tbody>
										<tfoot>
											<tr className="border-t">
												<th
													scope="row"
													className="py-3 pl-4 text-left font-medium sm:pl-5"
												>
													Total
												</th>
												<td className="py-3 pr-4 text-right font-semibold tabular-nums sm:pr-5">
													{money(breakdown.netMinor, breakdown.currency)}
												</td>
											</tr>
										</tfoot>
									</table>
								))}
							</div>
						)}
					</Panel>
				</div>
			</div>
		</div>
	);
}
