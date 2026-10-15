import {
	createFileRoute,
	Link,
	notFound,
	useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Trash2, Undo2 } from "lucide-react";

import { ConfirmDialog } from "#/components/confirm-dialog";
import { ActionError, StatusBadge } from "#/components/feedback";
import { Money } from "#/components/money";
import { BackLink, PageHeader } from "#/components/page-header";
import { Panel, PanelHeader } from "#/components/panel";
import { RecordNotFound } from "#/components/route-fallbacks";
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
import { type CurrencyCode, minorToInputString } from "#/lib/money";
import { pageTitle } from "#/lib/page-title";
import { notify } from "#/lib/toast";
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
		<RecordNotFound
			title="Transaction not found"
			back={
				<Button asChild variant="outline">
					<Link to="/transactions">Back to transactions</Link>
				</Button>
			}
		/>
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
	const { run, pending, error } = useAction();
	const isRefund = t.type === "REFUND";
	const blockedByRefunds = !isRefund && t.refunds.length > 0;

	return (
		<div>
			<PageHeader
				back={<BackLink to="/transactions">Transactions</BackLink>}
				title={t.description}
				badge={<StatusBadge>{isRefund ? "Refund" : "Expense"}</StatusBadge>}
				description={
					<>
						<Money
							minor={isRefund ? -t.amountMinor : t.amountMinor}
							currency={t.currency}
							className={
								isRefund
									? "font-semibold text-success"
									: "font-semibold text-foreground"
							}
						/>{" "}
						on <span className="tabular-nums">{t.occurredOn}</span>
					</>
				}
			/>

			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
				<section aria-labelledby="edit-title" className="grid gap-3">
					<h2 id="edit-title" className="text-[15px] font-semibold">
						Details
					</h2>
					<TransactionForm
						key={t.id}
						initialValues={{
							description: t.description,
							amount: minorToInputString(
								t.amountMinor,
								t.currency as CurrencyCode,
							),
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
							notify("Changes saved");
						}}
					/>
				</section>

				<aside className="grid gap-6 lg:pt-9">
					{isRefund && t.original && (
						<Panel aria-labelledby="original-title">
							<PanelHeader id="original-title" title="Refund of" />
							<div className="flex items-start justify-between gap-3 px-4 py-3 text-sm sm:px-5">
								<Link
									to="/transactions/$transactionId"
									params={{ transactionId: t.original.id }}
									className="font-medium underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
								>
									{t.original.description}
								</Link>
								<Money
									minor={t.original.amountMinor}
									currency={t.original.currency}
									className="font-semibold"
								/>
							</div>
						</Panel>
					)}

					{!isRefund && (
						<Panel aria-labelledby="refunds-title">
							<PanelHeader
								id="refunds-title"
								title="Refunds"
								actions={
									t.refundableMinor > 0 && (
										<Button asChild variant="outline" size="sm">
											<Link
												to="/transactions/new"
												search={{ refundOfId: t.id }}
											>
												<Undo2 aria-hidden="true" />
												Record refund
											</Link>
										</Button>
									)
								}
							/>
							{t.refunds.length === 0 ? (
								<p className="px-4 py-3 text-sm text-muted-foreground sm:px-5">
									No refunds recorded.
								</p>
							) : (
								<ul className="divide-y text-sm">
									{t.refunds.map((r) => (
										<li
											key={r.id}
											className="flex items-start justify-between gap-3 px-4 py-2.5 sm:px-5"
										>
											<div className="min-w-0">
												<Link
													to="/transactions/$transactionId"
													params={{ transactionId: r.id }}
													className="font-medium hover:underline"
												>
													{r.description}
												</Link>
												<p className="text-xs text-muted-foreground tabular-nums">
													{r.occurredOn}
												</p>
											</div>
											<Money
												minor={-r.amountMinor}
												currency={t.currency}
												className="font-semibold text-success"
											/>
										</li>
									))}
								</ul>
							)}
							<dl className="grid grid-cols-2 gap-3 border-t bg-background/60 px-4 py-3 text-xs sm:px-5">
								<div>
									<dt className="text-muted-foreground">Refunded</dt>
									<dd className="mt-0.5 text-sm font-medium tabular-nums">
										<Money minor={t.refundedMinor} currency={t.currency} />
									</dd>
								</div>
								<div>
									<dt className="text-muted-foreground">Can still refund</dt>
									<dd className="mt-0.5 text-sm font-medium tabular-nums">
										<Money minor={t.refundableMinor} currency={t.currency} />
									</dd>
								</div>
							</dl>
						</Panel>
					)}

					<section
						aria-labelledby="delete-title"
						className="grid gap-3 rounded-xl border border-dashed p-4 sm:p-5"
					>
						<div>
							<h2 id="delete-title" className="text-[15px] font-semibold">
								Delete
							</h2>
							<p className="mt-1 text-sm text-muted-foreground">
								This permanently removes the transaction from your ledger.
								{blockedByRefunds && " Delete its refunds first."}
							</p>
						</div>
						<ActionError error={error} />
						<div>
							<ConfirmDialog
								trigger={
									<Button variant="destructive-outline" size="sm">
										<Trash2 aria-hidden="true" />
										Delete transaction
									</Button>
								}
								title="Delete this transaction?"
								description="It is removed from your ledger and from every total. This cannot be undone."
								confirmLabel="Yes, delete it"
								pending={pending}
								onConfirm={() =>
									run(async () => {
										await remove({ data: { id: t.id } });
										await router.navigate({ to: "/transactions" });
										notify("Transaction deleted");
									})
								}
							/>
						</div>
					</section>
				</aside>
			</div>
		</div>
	);
}
