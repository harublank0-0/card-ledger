import {
	createFileRoute,
	Link,
	notFound,
	useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Money } from "#/components/money";
import { BackLink, PageHeader } from "#/components/page-header";
import { Panel } from "#/components/panel";
import { RecordNotFound } from "#/components/route-fallbacks";
import { Button } from "#/components/ui/button";
import { listCategoriesFn } from "#/features/categories/categories.functions";
import { listPaymentMethodsFn } from "#/features/payment-methods/payment-methods.functions";
import { listSubscriptionsFn } from "#/features/subscriptions/subscriptions.functions";
import { TransactionForm } from "#/features/transactions/components/transaction-form";
import {
	createTransactionFn,
	getTransactionFn,
} from "#/features/transactions/transactions.functions";
import { buildNewTransactionValues } from "#/features/transactions/transactions.prefill";
import type { CurrencyCode } from "#/lib/money";
import { formatMoney } from "#/lib/money";
import { pageTitle } from "#/lib/page-title";
import { notify } from "#/lib/toast";

export const Route = createFileRoute("/_authed/transactions/new")({
	head: pageTitle("Add transaction"),
	validateSearch: z.object({
		subscriptionId: z.uuid().optional().catch(undefined),
		refundOfId: z.uuid().optional().catch(undefined),
	}),
	loaderDeps: ({ search }) => search,
	loader: async ({ deps }) => {
		const [cards, categories, subs, original] = await Promise.all([
			listPaymentMethodsFn(),
			listCategoriesFn(),
			listSubscriptionsFn(),
			deps.refundOfId
				? getTransactionFn({ data: { id: deps.refundOfId } })
				: Promise.resolve(null),
		]);
		if (deps.refundOfId && (!original || original.type !== "EXPENSE")) {
			throw notFound();
		}
		const subscription =
			subs.subscriptions.find((s) => s.id === deps.subscriptionId) ?? null;
		const values = buildNewTransactionValues({
			today: subs.today,
			categories,
			cards,
			subscription,
			original,
		});
		return {
			values,
			original,
			cards: cards.map((c) => ({
				id: c.id,
				name: c.name,
				last4: c.last4,
				currency: c.currency,
			})),
			categories,
			subscriptions: subs.subscriptions.map((s) => ({
				id: s.id,
				name: s.name,
			})),
		};
	},
	notFoundComponent: () => (
		<RecordNotFound
			title="That expense could not be found"
			back={
				<Button asChild variant="outline">
					<Link to="/transactions">Back to transactions</Link>
				</Button>
			}
		/>
	),
	component: NewTransaction,
});

function NewTransaction() {
	const { values, original, cards, categories, subscriptions } =
		Route.useLoaderData();
	const router = useRouter();
	const create = useServerFn(createTransactionFn);
	const money = (minor: number, currency: string) =>
		formatMoney(minor, currency as CurrencyCode);

	return (
		<div className="max-w-2xl">
			<PageHeader
				back={<BackLink to="/transactions">Transactions</BackLink>}
				title={original ? "Record refund" : "Add transaction"}
				description={
					original
						? `Money you got back for ${original.description}.`
						: "Something you bought, with the card you paid with."
				}
			/>
			<div className="grid gap-5">
				{original && (
					<Panel aria-label="Original expense">
						<dl className="grid grid-cols-3 divide-x text-sm">
							<div className="px-4 py-3 sm:px-5">
								<dt className="text-xs text-muted-foreground">Original</dt>
								<dd className="mt-0.5 font-medium tabular-nums">
									<Money
										minor={original.amountMinor}
										currency={original.currency}
									/>
								</dd>
							</div>
							<div className="px-4 py-3 sm:px-5">
								<dt className="text-xs text-muted-foreground">
									Already refunded
								</dt>
								<dd className="mt-0.5 font-medium tabular-nums">
									<Money
										minor={original.refundedMinor}
										currency={original.currency}
									/>
								</dd>
							</div>
							<div className="px-4 py-3 sm:px-5">
								<dt className="text-xs text-muted-foreground">
									Can still refund
								</dt>
								<dd className="mt-0.5 font-medium tabular-nums">
									<Money
										minor={original.refundableMinor}
										currency={original.currency}
									/>
								</dd>
							</div>
						</dl>
					</Panel>
				)}
				<TransactionForm
					initialValues={values}
					cards={cards}
					categories={categories}
					subscriptions={subscriptions}
					isRefund={original !== null}
					autoCurrencyFromCard={original === null}
					amountHint={
						original
							? `Up to ${money(original.refundableMinor, original.currency)}`
							: undefined
					}
					submitLabel={original ? "Save refund" : "Save transaction"}
					onCancel={() =>
						original
							? router.navigate({
									to: "/transactions/$transactionId",
									params: { transactionId: original.id },
								})
							: router.navigate({ to: "/transactions" })
					}
					onSubmit={async (input) => {
						await create({ data: input });
						await router.invalidate();
						await router.navigate({
							to: "/transactions",
						});
						notify(original ? "Refund saved" : "Transaction saved");
					}}
				/>
			</div>
		</div>
	);
}
