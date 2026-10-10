import { createFileRoute, Link } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
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

function Transactions() {
	const { result, cards, categories } = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();

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

	return (
		<section className="grid gap-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-2xl font-semibold">Transactions</h1>
				<div className="flex items-center gap-2">
					<Button asChild variant="ghost" size="sm">
						<Link to="/categories">Manage categories</Link>
					</Button>
					<Button asChild>
						<Link to="/transactions/new">Add transaction</Link>
					</Button>
				</div>
			</div>

			<form
				className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5"
				onSubmit={(e) => e.preventDefault()}
				aria-label="Filters"
			>
				<div className="grid gap-1 text-xs text-muted-foreground">
					<label htmlFor="filter-from">From</label>
					<DateFilterInput
						id="filter-from"
						value={search.from}
						onChange={(from) => setFilter({ from })}
					/>
				</div>
				<div className="grid gap-1 text-xs text-muted-foreground">
					<label htmlFor="filter-to">To</label>
					<DateFilterInput
						id="filter-to"
						value={search.to}
						onChange={(to) => setFilter({ to })}
					/>
				</div>
				<div className="grid gap-1 text-xs text-muted-foreground">
					<span id="filter-card">Card</span>
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
				<div className="grid gap-1 text-xs text-muted-foreground">
					<span id="filter-category">Category</span>
					<Select
						value={search.categoryId ?? ALL}
						onValueChange={(v) =>
							setFilter({ categoryId: v === ALL ? undefined : v })
						}
					>
						<SelectTrigger aria-labelledby="filter-category" className="w-full">
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
				<div className="grid gap-1 text-xs text-muted-foreground">
					<span id="filter-type">Type</span>
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
					<div className="sm:col-span-2 lg:col-span-5">
						<Button asChild variant="ghost" size="sm">
							<Link to="/transactions" search={{}}>
								Clear filters
							</Link>
						</Button>
					</div>
				)}
			</form>

			{result.totals.length > 0 && (
				<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{result.totals.map((t) => (
						<div
							key={t.currency}
							className="rounded-xl border bg-card p-4 shadow-sm"
						>
							<p className="text-xs text-muted-foreground">
								{t.currency} {hasFilters ? "(filtered)" : "(all time)"}
							</p>
							<p className="text-2xl font-semibold">
								{money(t.netMinor, t.currency)}
							</p>
							<p className="text-xs text-muted-foreground">
								Spent {money(t.spentMinor, t.currency)}
								{t.refundedMinor > 0 &&
									` · refunded ${money(t.refundedMinor, t.currency)}`}
							</p>
						</div>
					))}
				</div>
			)}

			{result.total === 0 ? (
				<div className="rounded-xl border bg-card p-8 text-center">
					<p className="font-medium">
						{hasFilters
							? "No transactions match these filters"
							: "No transactions yet"}
					</p>
					<p className="mt-1 text-sm text-muted-foreground">
						{hasFilters
							? "Try widening the dates or clearing a filter."
							: "Record what you spend to see where your money goes."}
					</p>
				</div>
			) : (
				<ul className="grid gap-2">
					{result.items.map((t) => (
						<li key={t.id} className="rounded-xl border bg-card p-3 shadow-sm">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<p className="font-medium">
										<Link
											to="/transactions/$transactionId"
											params={{ transactionId: t.id }}
											className="hover:underline"
										>
											{t.description}
										</Link>
										{t.type === "REFUND" && (
											<span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
												Refund
											</span>
										)}
									</p>
									<p className="text-sm text-muted-foreground">
										{t.occurredOn}
										{" · "}
										{t.category?.name ?? "Uncategorized"}
										{t.paymentMethod
											? ` · ${t.paymentMethod.name} •••• ${t.paymentMethod.last4}`
											: ""}
										{t.subscription ? ` · ${t.subscription.name}` : ""}
									</p>
								</div>
								<p
									className={`whitespace-nowrap font-medium ${t.type === "REFUND" ? "text-emerald-700" : ""}`}
								>
									{money(signedAmount(t.type, t.amountMinor), t.currency)}
								</p>
							</div>
						</li>
					))}
				</ul>
			)}

			{result.pageCount > 1 && (
				<nav
					className="flex items-center justify-between text-sm"
					aria-label="Pagination"
				>
					<span className="text-muted-foreground">
						Page {result.page} of {result.pageCount} · {result.total}{" "}
						transactions
					</span>
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
				</nav>
			)}
		</section>
	);
}
