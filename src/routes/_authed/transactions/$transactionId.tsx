import {
	createFileRoute,
	Link,
	notFound,
	useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { listCategoriesFn } from "#/features/categories/categories.functions";
import { listPaymentMethodsFn } from "#/features/payment-methods/payment-methods.functions";
import { listSubscriptionsFn } from "#/features/subscriptions/subscriptions.functions";
import { TransactionForm } from "#/features/transactions/components/transaction-form";
import {
	deleteTransactionFn,
	getTransactionFn,
	updateTransactionFn,
} from "#/features/transactions/transactions.functions";
import { isUuid } from "#/lib/ids";
import {
	type CurrencyCode,
	formatMoney,
	minorToInputString,
} from "#/lib/money";
import { pageTitle } from "#/lib/page-title";
import { useAction } from "#/lib/use-action";

export const Route = createFileRoute("/_authed/transactions/$transactionId")({
	head: pageTitle("Transaction"),
	loader: async ({ params }) => {
		if (!isUuid(params.transactionId)) throw notFound();
		const [transaction, cards, categories, subs] = await Promise.all([
			getTransactionFn({ data: { id: params.transactionId } }),
			listPaymentMethodsFn(),
			listCategoriesFn(),
			listSubscriptionsFn(),
		]);
		if (!transaction) throw notFound();

		// Things this transaction already links to stay selectable even if archived.
		const withLinked = <T extends { id: string }>(
			list: T[],
			linked: T | null,
		) =>
			linked && !list.some((x) => x.id === linked.id)
				? [...list, linked]
				: list;
		const cardOptions = withLinked(
			cards.map((c) => ({
				id: c.id,
				name: c.name,
				last4: c.last4,
				currency: c.currency,
			})),
			transaction.paymentMethod
				? { ...transaction.paymentMethod, currency: transaction.currency }
				: null,
		);
		return {
			transaction,
			cards: cardOptions,
			categories: withLinked(categories, transaction.category),
			subscriptions: withLinked(
				subs.subscriptions.map((s) => ({ id: s.id, name: s.name })),
				transaction.subscription,
			),
		};
	},
	notFoundComponent: () => (
		<p className="text-muted-foreground">Transaction not found.</p>
	),
	component: EditTransaction,
});

function EditTransaction() {
	const {
		transaction: t,
		cards,
		categories,
		subscriptions,
	} = Route.useLoaderData();
	const router = useRouter();
	const update = useServerFn(updateTransactionFn);
	const remove = useServerFn(deleteTransactionFn);
	const [confirming, setConfirming] = useState(false);
	const { run, pending, error } = useAction();
	const isRefund = t.type === "REFUND";
	const money = (minor: number, currency = t.currency) =>
		formatMoney(minor, currency as CurrencyCode);

	return (
		<section className="grid gap-6">
			<div>
				<h1 className="text-2xl font-semibold">
					{t.description}
					<span className="ml-2 rounded bg-secondary px-1.5 py-0.5 align-middle text-xs text-muted-foreground">
						{isRefund ? "Refund" : "Expense"}
					</span>
				</h1>
				<p className="text-muted-foreground">
					{isRefund ? "−" : ""}
					{money(t.amountMinor)} · {t.occurredOn}
				</p>
			</div>

			{isRefund && t.original && (
				<div className="max-w-xl rounded-xl border bg-card p-4 text-sm shadow-sm">
					Refund of{" "}
					<Link
						to="/transactions/$transactionId"
						params={{ transactionId: t.original.id }}
						className="font-medium underline"
					>
						{t.original.description}
					</Link>{" "}
					({money(t.original.amountMinor, t.original.currency)})
				</div>
			)}

			{!isRefund && (
				<div className="grid max-w-xl gap-3 rounded-xl border bg-card p-5 shadow-sm">
					<p className="text-sm font-medium">Refunds</p>
					{t.refunds.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							No refunds recorded.
						</p>
					) : (
						<ul className="grid gap-1 text-sm">
							{t.refunds.map((r) => (
								<li key={r.id} className="flex justify-between gap-3">
									<Link
										to="/transactions/$transactionId"
										params={{ transactionId: r.id }}
										className="hover:underline"
									>
										{r.occurredOn} · {r.description}
									</Link>
									<span>−{money(r.amountMinor)}</span>
								</li>
							))}
						</ul>
					)}
					<p className="text-xs text-muted-foreground">
						Refunded {money(t.refundedMinor)} · can still refund{" "}
						{money(t.refundableMinor)}
					</p>
					{t.refundableMinor > 0 && (
						<div>
							<Button asChild variant="outline" size="sm">
								<Link to="/transactions/new" search={{ refundOfId: t.id }}>
									Record refund
								</Link>
							</Button>
						</div>
					)}
				</div>
			)}

			<TransactionForm
				key={t.id}
				initialValues={{
					description: t.description,
					amount: minorToInputString(t.amountMinor, t.currency as CurrencyCode),
					currency: t.currency as CurrencyCode,
					occurredOn: t.occurredOn,
					categoryId: t.categoryId ?? "",
					paymentMethodId: t.paymentMethodId ?? "",
					subscriptionId: t.subscriptionId ?? "",
					refundOfId: t.refundOfId ?? "",
					notes: t.notes ?? "",
				}}
				cards={cards}
				categories={categories}
				subscriptions={subscriptions}
				isRefund={isRefund}
				autoCurrencyFromCard={false}
				submitLabel="Save changes"
				onCancel={() => router.navigate({ to: "/transactions" })}
				onSubmit={async (values) => {
					await update({ data: { id: t.id, values } });
					await router.invalidate();
					await router.navigate({ to: "/transactions" });
				}}
			/>

			<div className="grid max-w-xl gap-3 rounded-xl border bg-card p-5 shadow-sm">
				<p className="text-sm font-medium">Delete</p>
				<p className="text-sm text-muted-foreground">
					This permanently removes the transaction from your ledger.
					{!isRefund && t.refunds.length > 0 && " Delete its refunds first."}
				</p>
				{error && (
					<p role="alert" className="text-sm text-destructive">
						{error}
					</p>
				)}
				{confirming ? (
					<div className="flex gap-2">
						<Button
							variant="destructive"
							disabled={pending}
							onClick={async () => {
								const outcome = await run(async () => {
									await remove({ data: { id: t.id } });
									await router.navigate({ to: "/transactions" });
								});
								if (outcome === "failed") setConfirming(false);
							}}
						>
							Yes, delete it
						</Button>
						<Button variant="ghost" onClick={() => setConfirming(false)}>
							Keep it
						</Button>
					</div>
				) : (
					<div>
						<Button variant="outline" onClick={() => setConfirming(true)}>
							Delete transaction
						</Button>
					</div>
				)}
			</div>
		</section>
	);
}
