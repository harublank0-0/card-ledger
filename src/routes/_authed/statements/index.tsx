import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import { FileText, Plus } from "lucide-react";

import { EmptyState } from "#/components/feedback";
import { PageHeader } from "#/components/page-header";
import { Figure, Panel, Stat, StatGroup } from "#/components/panel";
import {
	segmentedGroupClass,
	segmentedItemClass,
} from "#/components/segmented";
import { Button } from "#/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import {
	rowLinkClass,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { listPaymentMethodsFn } from "#/features/payment-methods/payment-methods.functions";
import { StatementStatusBadge } from "#/features/statements/components/statement-status";
import { listStatementsFn } from "#/features/statements/statements.functions";
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

function Statements() {
	const { result, cards } = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const loading = useRouterState({ select: (s) => s.status === "pending" });
	const showPaid = search.paid === true;

	return (
		<div>
			<PageHeader
				title="Statements"
				description="What each card's statement says you owe, and what you have paid."
				actions={
					<Button asChild>
						<Link
							to="/statements/new"
							search={search.cardId ? { cardId: search.cardId } : {}}
						>
							<Plus aria-hidden="true" />
							Add statement
						</Link>
					</Button>
				}
			/>

			<div className="grid gap-6">
				{result.outstanding.length > 0 && (
					<StatGroup>
						{result.outstanding.map((o) => (
							<Stat key={o.currency} label={`Still owed (${o.currency})`}>
								<Figure>{money(o.outstandingMinor, o.currency)}</Figure>
							</Stat>
						))}
					</StatGroup>
				)}

				<Panel aria-label="Statements">
					<div className="flex flex-col gap-3 border-b bg-background/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
						<nav aria-label="Which statements" className={segmentedGroupClass}>
							<Link
								to="/statements"
								search={{ ...search, paid: undefined }}
								activeOptions={{ exact: true }}
								className={segmentedItemClass}
							>
								Unpaid
							</Link>
							<Link
								to="/statements"
								search={{ ...search, paid: true }}
								activeOptions={{ exact: true }}
								className={segmentedItemClass}
							>
								All, including paid
							</Link>
						</nav>
						<div className="flex items-center gap-2">
							<span
								id="filter-card"
								className="text-xs font-medium text-muted-foreground"
							>
								Card
							</span>
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
								<SelectTrigger
									aria-labelledby="filter-card"
									className="w-full sm:w-60"
								>
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
					</div>

					{result.statements.length === 0 ? (
						<EmptyState
							icon={FileText}
							title={showPaid ? "No statements yet" : "No unpaid statements"}
							action={
								<Button asChild variant="outline">
									<Link
										to="/statements/new"
										search={search.cardId ? { cardId: search.cardId } : {}}
									>
										Add statement
									</Link>
								</Button>
							}
						>
							Add the statement your bank sends to track what you owe and when
							it is due.
						</EmptyState>
					) : (
						<div
							className={cn(
								"transition-opacity duration-150",
								loading && "opacity-60",
							)}
						>
							<Table>
								<caption className="sr-only">Statements</caption>
								<TableHeader>
									<TableRow>
										<TableHead>Card</TableHead>
										<TableHead className="hidden md:table-cell">
											Period
										</TableHead>
										<TableHead className="hidden sm:table-cell">Due</TableHead>
										<TableHead className="hidden lg:table-cell">
											Status
										</TableHead>
										<TableHead numeric className="hidden lg:table-cell">
											Minimum
										</TableHead>
										<TableHead numeric>Owed</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{result.statements.map((s) => (
										<TableRow key={s.id} interactive>
											<TableCell className="w-full max-w-0 lg:max-w-none">
												<Link
													to="/statements/$statementId"
													params={{ statementId: s.id }}
													className={rowLinkClass}
												>
													{s.card.name}{" "}
													<span className="tabular-nums">
														•••• {s.card.last4}
													</span>
												</Link>
												<div className="mt-1 lg:hidden">
													<StatementStatusBadge statement={s} />
												</div>
												<p className="mt-1 text-xs text-muted-foreground tabular-nums sm:hidden">
													Due {s.dueDate}
												</p>
												<p className="mt-0.5 hidden text-xs text-muted-foreground tabular-nums sm:block md:hidden">
													{s.periodStart} to {s.periodEnd}
												</p>
											</TableCell>
											<TableCell className="hidden whitespace-nowrap text-muted-foreground tabular-nums md:table-cell">
												{s.periodStart} – {s.periodEnd}
											</TableCell>
											<TableCell className="hidden whitespace-nowrap tabular-nums sm:table-cell">
												{s.dueDate}
											</TableCell>
											<TableCell className="hidden lg:table-cell">
												<StatementStatusBadge statement={s} />
											</TableCell>
											<TableCell
												numeric
												className="hidden font-normal text-muted-foreground lg:table-cell"
											>
												{s.minimumDueMinor === null
													? "—"
													: money(s.minimumDueMinor, s.currency)}
											</TableCell>
											<TableCell numeric>
												{s.status === "PAID"
													? money(s.balanceMinor, s.currency)
													: money(s.outstandingMinor, s.currency)}
												<span className="block text-xs font-normal text-muted-foreground">
													{s.status === "PAID"
														? s.overpaidMinor > 0
															? `credit ${money(s.overpaidMinor, s.currency)}`
															: "statement balance"
														: s.paidMinor > 0
															? `of ${money(s.balanceMinor, s.currency)}`
															: "owed"}
												</span>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
					{result.statements.length > 0 && result.outstanding.length === 0 && (
						<p className="border-t px-4 py-3 text-sm text-muted-foreground sm:px-5">
							Nothing is owed on these statements.
						</p>
					)}
				</Panel>
			</div>
		</div>
	);
}
