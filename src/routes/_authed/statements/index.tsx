import { createFileRoute, Link } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { listPaymentMethodsFn } from "#/features/payment-methods/payment-methods.functions";
import { listStatementsFn } from "#/features/statements/statements.functions";
import { statusLabel } from "#/features/statements/statements.logic";
import { statementFiltersSchema } from "#/features/statements/statements.schemas";
import { type CurrencyCode, formatMoney } from "#/lib/money";
import { pageTitle } from "#/lib/page-title";

export const Route = createFileRoute("/_authed/statements/")({
	head: pageTitle("Statements"),
	validateSearch: statementFiltersSchema,
	loaderDeps: ({ search }) => search,
	loader: async ({ deps }) => {
		const [result, cards] = await Promise.all([
			listStatementsFn({ data: deps }),
			// Archived cards keep their statements, so keep them filterable.
			listPaymentMethodsFn({ data: { includeArchived: true } }),
		]);
		return { result, cards };
	},
	component: Statements,
});

const ALL = "all";
const money = (minor: number, currency: string) =>
	formatMoney(minor, currency as CurrencyCode);

const TONE = {
	danger: "bg-destructive/10 text-destructive",
	neutral: "bg-secondary text-muted-foreground",
	success: "bg-emerald-100 text-emerald-800",
} as const;

function Statements() {
	const { result, cards } = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const showPaid = search.paid === true;

	return (
		<section className="grid gap-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-2xl font-semibold">Statements</h1>
				<div className="flex items-center gap-2">
					<Button asChild variant="ghost" size="sm">
						<Link
							to="/statements"
							search={{ ...search, paid: showPaid ? undefined : true }}
						>
							{showPaid ? "Hide paid" : "Show paid"}
						</Link>
					</Button>
					<Button asChild>
						<Link
							to="/statements/new"
							search={search.cardId ? { cardId: search.cardId } : {}}
						>
							Add statement
						</Link>
					</Button>
				</div>
			</div>

			<div className="grid max-w-xs gap-1 text-xs text-muted-foreground">
				<span id="filter-card">Card</span>
				<Select
					value={search.cardId ?? ALL}
					onValueChange={(v) =>
						navigate({
							search: (prev) => ({
								...prev,
								cardId: v === ALL ? undefined : v,
							}),
						})
					}
				>
					<SelectTrigger aria-labelledby="filter-card" className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value={ALL}>All cards</SelectItem>
						{cards.map((c) => (
							<SelectItem key={c.id} value={c.id}>
								{c.name} •••• {c.last4}
								{c.archivedAt ? " (archived)" : ""}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{result.outstanding.length > 0 ? (
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{result.outstanding.map((o) => (
						<div
							key={o.currency}
							className="rounded-xl border bg-card p-4 shadow-sm"
						>
							<p className="text-xs text-muted-foreground">
								Still owed ({o.currency})
							</p>
							<p className="text-2xl font-semibold">
								{money(o.outstandingMinor, o.currency)}
							</p>
						</div>
					))}
				</div>
			) : (
				result.statements.length > 0 && (
					<p className="text-sm text-muted-foreground">
						Nothing is owed on these statements.
					</p>
				)
			)}

			{result.statements.length === 0 ? (
				<div className="rounded-xl border bg-card p-8 text-center">
					<p className="font-medium">
						{showPaid ? "No statements yet" : "No unpaid statements"}
					</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Add the statement your bank sends to track what you owe and when it
						is due.
					</p>
				</div>
			) : (
				<ul className="grid gap-2">
					{result.statements.map((s) => {
						const label = statusLabel(s);
						return (
							<li
								key={s.id}
								className="rounded-xl border bg-card p-3 shadow-sm"
							>
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<p className="font-medium">
											<Link
												to="/statements/$statementId"
												params={{ statementId: s.id }}
												className="hover:underline"
											>
												{s.card.name} •••• {s.card.last4}
											</Link>
											<span
												className={`ml-2 rounded px-1.5 py-0.5 text-xs ${TONE[label.tone]}`}
											>
												{label.label}
											</span>
										</p>
										<p className="text-sm text-muted-foreground">
											{s.periodStart} to {s.periodEnd} · due {s.dueDate}
											{s.minimumDueMinor !== null &&
												` · minimum ${money(s.minimumDueMinor, s.currency)}`}
										</p>
									</div>
									<div className="text-right">
										<p className="whitespace-nowrap font-medium">
											{s.status === "PAID"
												? money(s.balanceMinor, s.currency)
												: money(s.outstandingMinor, s.currency)}
										</p>
										<p className="whitespace-nowrap text-xs text-muted-foreground">
											{s.status === "PAID"
												? s.overpaidMinor > 0
													? `credit ${money(s.overpaidMinor, s.currency)}`
													: "statement balance"
												: s.paidMinor > 0
													? `of ${money(s.balanceMinor, s.currency)}`
													: "owed"}
										</p>
									</div>
								</div>
							</li>
						);
					})}
				</ul>
			)}
		</section>
	);
}
