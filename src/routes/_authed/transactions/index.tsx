import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import { Plus, ReceiptText, Repeat, SearchX, Tags } from "lucide-react";

import { EmptyState, StatusBadge } from "#/components/feedback";
import { PageHeader } from "#/components/page-header";
import { Figure, Panel, Stat, StatGroup } from "#/components/panel";
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
import { listCategoriesFn } from "#/features/categories/categories.functions";
import { listPaymentMethodsFn } from "#/features/payment-methods/payment-methods.functions";
import { DateFilterInput } from "#/features/transactions/components/date-filter-input";
import { listTransactionsFn } from "#/features/transactions/transactions.functions";
import { signedAmount } from "#/features/transactions/transactions.logic";
import { transactionFiltersSchema } from "#/features/transactions/transactions.schemas";
import { type CurrencyCode, formatMoney } from "#/lib/money";
import { pageTitle } from "#/lib/page-title";

export const Route = createFileRoute("/_authed/transactions/")({
	head: pageTitle("Transactions"),
	validateSearch: transactionFiltersSchema,
	loaderDeps: ({ search }) => search,
	loader: async ({ deps }) => {
		const [result, cards, categories] = await Promise.all([
			listTransactionsFn({ data: deps }),
			// Archived cards and categories still appear on history, so keep them filterable.
			listPaymentMethodsFn({ data: { includeArchived: true } }),
			listCategoriesFn({ data: { includeArchived: true } }),
		]);
		return { result, cards, categories };
	},
	component: Transactions,
});

const ALL = "all";
const NONE = "none";

const money = (minor: number, currency: string) =>
	formatMoney(minor, currency as CurrencyCode);

const filterLabelClass = "text-xs font-medium text-muted-foreground";

function Transactions() {
	const { result, cards, categories } = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	const loading = useRouterState({ select: (s) => s.status === "pending" });

	// Any filter change goes back to page 1.
	const setFilter = (patch: Record<string, string | undefined>) =>
		navigate({
			search: (prev) => ({ ...prev, ...patch, page: undefined }),
		});
	const hasFilters = Boolean(
		search.from ||
			search.to ||
			search.cardId ||
			search.categoryId ||
			search.type,
	);
	const firstShown = (result.page - 1) * result.pageSize + 1;
	const lastShown = firstShown + result.items.length - 1;

	return (
		<div>
			<PageHeader
				title="Transactions"
				description="What you bought and what you got back, newest first."
				actions={
					<>
						<Button asChild variant="outline">
							<Link to="/categories">
								<Tags aria-hidden="true" />
								Manage categories
							</Link>
						</Button>
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
				{result.totals.length > 0 && (
					<StatGroup>
						{result.totals.map((t) => (
							<Stat
								key={t.currency}
								label={`${t.currency}, ${hasFilters ? "matching the filters" : "all time"}`}
							>
								<Figure>{money(t.netMinor, t.currency)}</Figure>
								<p className="text-xs text-muted-foreground tabular-nums">
									Spent {money(t.spentMinor, t.currency)}
									{t.refundedMinor > 0 &&
										`, refunded ${money(t.refundedMinor, t.currency)}`}
								</p>
							</Stat>
						))}
					</StatGroup>
				)}

				<Panel aria-label="Ledger">
					<form
						className="grid grid-cols-2 gap-3 border-b bg-background/50 px-4 py-3.5 sm:px-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)]"
						onSubmit={(e) => e.preventDefault()}
						aria-label="Filters"
					>
						<div className="grid min-w-0 gap-1.5">
							<label htmlFor="filter-from" className={filterLabelClass}>
								From
							</label>
							<DateFilterInput
								id="filter-from"
								value={search.from}
								onChange={(from) => setFilter({ from })}
							/>
						</div>
						<div className="grid min-w-0 gap-1.5">
							<label htmlFor="filter-to" className={filterLabelClass}>
								To
							</label>
							<DateFilterInput
								id="filter-to"
								value={search.to}
								onChange={(to) => setFilter({ to })}
							/>
						</div>
						<div className="grid min-w-0 gap-1.5">
							<span id="filter-card" className={filterLabelClass}>
								Card
							</span>
							<Select
								value={search.cardId ?? ALL}
								onValueChange={(v) =>
									setFilter({ cardId: v === ALL ? undefined : v })
								}
							>
								<SelectTrigger aria-labelledby="filter-card" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={ALL}>All cards</SelectItem>
									<SelectItem value={NONE}>No card</SelectItem>
									{cards.map((c) => (
										<SelectItem key={c.id} value={c.id}>
											{c.name} •••• {c.last4}
											{c.archivedAt ? " (archived)" : ""}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="grid min-w-0 gap-1.5">
							<span id="filter-category" className={filterLabelClass}>
								Category
							</span>
							<Select
								value={search.categoryId ?? ALL}
								onValueChange={(v) =>
									setFilter({ categoryId: v === ALL ? undefined : v })
								}
							>
								<SelectTrigger
									aria-labelledby="filter-category"
									className="w-full"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={ALL}>All categories</SelectItem>
									<SelectItem value={NONE}>Uncategorized</SelectItem>
									{categories.map((c) => (
										<SelectItem key={c.id} value={c.id}>
											{c.name}
											{c.archived ? " (archived)" : ""}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="col-span-2 grid min-w-0 gap-1.5 xl:col-span-1">
							<span id="filter-type" className={filterLabelClass}>
								Type
							</span>
							<Select
								value={search.type ?? ALL}
								onValueChange={(v) =>
									setFilter({ type: v === ALL ? undefined : v })
								}
							>
								<SelectTrigger aria-labelledby="filter-type" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={ALL}>Expenses and refunds</SelectItem>
									<SelectItem value="EXPENSE">Expenses only</SelectItem>
									<SelectItem value="REFUND">Refunds only</SelectItem>
								</SelectContent>
							</Select>
						</div>
						{hasFilters && (
							<div className="col-span-2 flex items-center justify-between gap-3 xl:col-span-5">
								<p className="text-xs text-muted-foreground">
									{result.total === 1
										? "1 transaction matches"
										: `${result.total} transactions match`}
								</p>
								<Button asChild variant="ghost" size="sm">
									<Link to="/transactions" search={{}}>
										Clear filters
									</Link>
								</Button>
							</div>
						)}
					</form>

					{result.total === 0 ? (
						hasFilters ? (
							<EmptyState
								icon={SearchX}
								title="No transactions match these filters"
								action={
									<Button asChild variant="outline">
										<Link to="/transactions" search={{}}>
											Clear filters
										</Link>
									</Button>
								}
							>
								Try widening the dates or clearing a filter.
							</EmptyState>
						) : (
							<EmptyState
								icon={ReceiptText}
								title="No transactions yet"
								action={
									<Button asChild>
										<Link to="/transactions/new">
											<Plus aria-hidden="true" />
											Add transaction
										</Link>
									</Button>
								}
							>
								Record what you spend to see where your money goes.
							</EmptyState>
						)
					) : (
						<div
							className={cn(
								"transition-opacity duration-150",
								loading && "opacity-60",
							)}
						>
							<Table>
								<caption className="sr-only">
									Transactions, page {result.page} of {result.pageCount}
								</caption>
								<TableHeader>
									<TableRow>
										<TableHead className="hidden w-28 md:table-cell">
											Date
										</TableHead>
										<TableHead>Description</TableHead>
										<TableHead className="hidden md:table-cell">
											Category
										</TableHead>
										<TableHead className="hidden md:table-cell">Card</TableHead>
										<TableHead numeric>Amount</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{result.items.map((t) => (
										<TableRow key={t.id} interactive>
											<TableCell className="hidden whitespace-nowrap text-muted-foreground tabular-nums md:table-cell">
												{t.occurredOn}
											</TableCell>
											<TableCell className="w-full max-w-0 md:max-w-none">
												<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
													<Link
														to="/transactions/$transactionId"
														params={{ transactionId: t.id }}
														className={rowLinkClass}
													>
														{t.description}
													</Link>
													{t.type === "REFUND" && (
														<StatusBadge>Refund</StatusBadge>
													)}
												</div>
												<p className="mt-0.5 truncate text-xs text-muted-foreground md:hidden">
													<span className="tabular-nums">{t.occurredOn}</span>
													{" · "}
													{t.category?.name ?? "Uncategorized"}
													{t.paymentMethod
														? ` · ${t.paymentMethod.name} •••• ${t.paymentMethod.last4}`
														: ""}
												</p>
												{t.subscription && (
													<p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
														<Repeat
															aria-hidden="true"
															className="size-3 shrink-0"
														/>
														{t.subscription.name}
													</p>
												)}
											</TableCell>
											<TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
												{t.category?.name ?? "Uncategorized"}
											</TableCell>
											<TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
												{t.paymentMethod ? (
													<>
														{t.paymentMethod.name}{" "}
														<span className="tabular-nums">
															•••• {t.paymentMethod.last4}
														</span>
													</>
												) : (
													"No card"
												)}
											</TableCell>
											<TableCell
												numeric
												className={cn(t.type === "REFUND" && "text-success")}
											>
												{money(signedAmount(t.type, t.amountMinor), t.currency)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}

					{result.total > 0 && (
						<nav
							className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm sm:px-5"
							aria-label="Pagination"
						>
							<span className="text-muted-foreground tabular-nums">
								{result.pageCount > 1
									? `${firstShown}–${lastShown} of ${result.total} transactions · page ${result.page} of ${result.pageCount}`
									: result.total === 1
										? "1 transaction"
										: `${result.total} transactions`}
							</span>
							{result.pageCount > 1 && (
								<span className="flex gap-2">
									{result.page > 1 ? (
										<Button asChild variant="outline" size="sm">
											<Link
												to="/transactions"
												search={{ ...search, page: result.page - 1 }}
											>
												Previous
											</Link>
										</Button>
									) : (
										<Button variant="outline" size="sm" disabled>
											Previous
										</Button>
									)}
									{result.page < result.pageCount ? (
										<Button asChild variant="outline" size="sm">
											<Link
												to="/transactions"
												search={{ ...search, page: result.page + 1 }}
											>
												Next
											</Link>
										</Button>
									) : (
										<Button variant="outline" size="sm" disabled>
											Next
										</Button>
									)}
								</span>
							)}
						</nav>
					)}
				</Panel>
			</div>
		</div>
	);
}
