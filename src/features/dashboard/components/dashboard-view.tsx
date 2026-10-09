import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

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

function Tile({
	id,
	title,
	children,
}: {
	id: string;
	title: string;
	children: ReactNode;
}) {
	return (
		<section
			aria-labelledby={id}
			className="rounded-xl border bg-card p-4 shadow-sm"
		>
			<h2 id={id} className="text-xs font-normal text-muted-foreground">
				{title}
			</h2>
			<div className="mt-1 grid gap-1">{children}</div>
		</section>
	);
}

function EventLink({
	event,
	children,
}: {
	event: UpcomingEvent;
	children: ReactNode;
}) {
	const className = "hover:underline";
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

export function DashboardView({ data }: { data: DashboardData }) {
	const monthLabel = formatMonthLabel(data.month);
	const showHints =
		data.counts.cards === 0 ||
		data.counts.subscriptions === 0 ||
		data.counts.transactions === 0;
	const upcoming = data.upcoming.slice(0, MAX_UPCOMING);

	return (
		<div className="grid gap-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-2xl font-semibold">Dashboard</h1>
				<nav aria-label="Month" className="flex items-center gap-2">
					<Button asChild variant="outline" size="sm">
						<Link to="/" search={{ month: data.previousMonth }}>
							Previous
						</Link>
					</Button>
					<span
						className="min-w-32 text-center text-sm font-medium"
						aria-live="polite"
					>
						{monthLabel}
					</span>
					{data.nextMonth ? (
						<Button asChild variant="outline" size="sm">
							<Link to="/" search={{ month: data.nextMonth }}>
								Next
							</Link>
						</Button>
					) : (
						<Button variant="outline" size="sm" disabled>
							Next
						</Button>
					)}
				</nav>
			</div>

			{showHints && (
				<section
					aria-labelledby="hints-title"
					className="rounded-xl border bg-card p-4 shadow-sm"
				>
					<h2 id="hints-title" className="font-medium">
						Get started
					</h2>
					<ul className="mt-2 grid gap-1 text-sm">
						{data.counts.cards === 0 && (
							<li>
								<Link to="/cards/new" className="underline">
									Add a credit card
								</Link>{" "}
								(only the last four digits are stored)
							</li>
						)}
						{data.counts.subscriptions === 0 && (
							<li>
								<Link to="/subscriptions/new" className="underline">
									Track a subscription
								</Link>{" "}
								to see what renews next
							</li>
						)}
						{data.counts.transactions === 0 && (
							<li>
								<Link to="/transactions/new" className="underline">
									Record a transaction
								</Link>{" "}
								to see where your money goes
							</li>
						)}
					</ul>
				</section>
			)}

			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				<Tile id="spent-title" title={`Spent in ${monthLabel}`}>
					{data.spending.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							Nothing recorded this month.
						</p>
					) : (
						data.spending.map((t) => (
							<div key={t.currency}>
								<p className="text-2xl font-semibold">
									{money(t.netMinor, t.currency)}
								</p>
								<p className="text-xs text-muted-foreground">
									Spent {money(t.spentMinor, t.currency)}
									{t.refundedMinor > 0 &&
										` · refunded ${money(t.refundedMinor, t.currency)}`}
								</p>
							</div>
						))
					)}
				</Tile>

				<Tile id="subs-title" title="Subscriptions">
					<p className="text-2xl font-semibold">
						{data.subscriptions.activeCount}
						<span className="ml-1 text-sm font-normal text-muted-foreground">
							active
						</span>
					</p>
					{data.subscriptions.commitments.length === 0 ? (
						<p className="text-xs text-muted-foreground">
							No monthly commitment yet.
						</p>
					) : (
						data.subscriptions.commitments.map((c) => (
							<p key={c.currency} className="text-sm">
								<span className="font-medium">
									{money(c.monthlyMinor, c.currency)}
								</span>
								<span className="text-muted-foreground"> per month</span>
							</p>
						))
					)}
					<Link to="/subscriptions" className="text-xs underline">
						Manage subscriptions
					</Link>
				</Tile>

				<Tile id="owed-title" title="Owed on cards">
					{data.owed.outstanding.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							Nothing owed on recorded statements.
						</p>
					) : (
						data.owed.outstanding.map((o) => (
							<p key={o.currency} className="text-2xl font-semibold">
								{money(o.outstandingMinor, o.currency)}
							</p>
						))
					)}
					{data.owed.overdueCount > 0 && (
						<Link
							to="/statements"
							className="text-sm font-medium text-destructive underline"
						>
							{data.owed.overdueCount} overdue
						</Link>
					)}
					{data.owed.overdueCount === 0 && (
						<Link to="/statements" className="text-xs underline">
							View statements
						</Link>
					)}
				</Tile>
			</div>

			<div className="grid gap-6 lg:grid-cols-2">
				<section
					aria-labelledby="upcoming-title"
					className="rounded-xl border bg-card p-4 shadow-sm"
				>
					<h2 id="upcoming-title" className="font-medium">
						Coming up{" "}
						<span className="text-sm font-normal text-muted-foreground">
							(next {UPCOMING_HORIZON_DAYS} days)
						</span>
					</h2>
					{upcoming.length === 0 ? (
						<p className="mt-2 text-sm text-muted-foreground">
							Nothing due in the next {UPCOMING_HORIZON_DAYS} days.
						</p>
					) : (
						<ul className="mt-2 grid gap-2">
							{upcoming.map((event) => {
								const { text, tone } = describeUpcoming(event);
								return (
									<li
										key={`${event.kind}-${event.target.id}-${event.date}`}
										className="flex items-start justify-between gap-3 text-sm"
									>
										<EventLink event={event}>
											<span
												className={
													tone === "danger"
														? "font-medium text-destructive"
														: ""
												}
											>
												{text}
											</span>
										</EventLink>
										{event.amountMinor !== undefined && event.currency && (
											<span className="whitespace-nowrap font-medium">
												{money(event.amountMinor, event.currency)}
											</span>
										)}
									</li>
								);
							})}
						</ul>
					)}
					{data.upcoming.length > MAX_UPCOMING && (
						<p className="mt-2 text-xs text-muted-foreground">
							Showing the first {MAX_UPCOMING} of {data.upcoming.length}.
						</p>
					)}
				</section>

				<section
					aria-labelledby="categories-title"
					className="rounded-xl border bg-card p-4 shadow-sm"
				>
					<h2 id="categories-title" className="font-medium">
						Spending by category
					</h2>
					{data.byCategory.length === 0 ? (
						<p className="mt-2 text-sm text-muted-foreground">
							No spending recorded in {monthLabel}.
						</p>
					) : (
						<div className="mt-2 grid gap-5">
							{data.byCategory.map((breakdown) => (
								<table key={breakdown.currency} className="w-full text-sm">
									<caption className="mb-1 text-left text-xs text-muted-foreground">
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
													className="w-full py-1 pr-3 text-left font-normal"
												>
													<span className="block">{row.name}</span>
													<span
														aria-hidden="true"
														className="mt-1 block h-1.5 rounded bg-secondary"
													>
														<span
															className="block h-full rounded bg-primary"
															style={{
																width: `${barPercent(row.netMinor, breakdown.maxNetMinor)}%`,
															}}
														/>
													</span>
												</th>
												<td className="whitespace-nowrap py-1 text-right align-top font-medium">
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
										<tr>
											<th scope="row" className="pt-2 text-left font-medium">
												Total
											</th>
											<td className="pt-2 text-right font-semibold">
												{money(breakdown.netMinor, breakdown.currency)}
											</td>
										</tr>
									</tfoot>
								</table>
							))}
						</div>
					)}
				</section>
			</div>

			<section
				aria-labelledby="recent-title"
				className="rounded-xl border bg-card p-4 shadow-sm"
			>
				<div className="flex items-center justify-between gap-3">
					<h2 id="recent-title" className="font-medium">
						Recent transactions
					</h2>
					<Link to="/transactions" className="text-sm underline">
						View all
					</Link>
				</div>
				{data.recent.length === 0 ? (
					<p className="mt-2 text-sm text-muted-foreground">
						No transactions yet.
					</p>
				) : (
					<ul className="mt-2 grid gap-2">
						{data.recent.map((t) => (
							<li
								key={t.id}
								className="flex items-start justify-between gap-3 text-sm"
							>
								<div className="min-w-0">
									<Link
										to="/transactions/$transactionId"
										params={{ transactionId: t.id }}
										className="font-medium hover:underline"
									>
										{t.description}
									</Link>
									{t.type === "REFUND" && (
										<span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
											Refund
										</span>
									)}
									<p className="text-xs text-muted-foreground">
										{t.occurredOn} · {t.category?.name ?? "Uncategorized"}
										{t.paymentMethod
											? ` · ${t.paymentMethod.name} •••• ${t.paymentMethod.last4}`
											: ""}
									</p>
								</div>
								<span
									className={`whitespace-nowrap font-medium ${t.type === "REFUND" ? "text-emerald-700" : ""}`}
								>
									{money(signedAmount(t.type, t.amountMinor), t.currency)}
								</span>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}
