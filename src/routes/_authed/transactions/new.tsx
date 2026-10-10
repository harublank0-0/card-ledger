import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";

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
		<p className="text-muted-foreground">That expense could not be found.</p>
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
		<section className="grid gap-4">
			<h1 className="text-2xl font-semibold">
				{original ? "Record refund" : "Add transaction"}
			</h1>
			{original && (
				<div className="max-w-xl rounded-xl border bg-card p-4 text-sm shadow-sm">
					<p className="font-medium">Refund of: {original.description}</p>
					<p className="text-muted-foreground">
						Original {money(original.amountMinor, original.currency)} · already
						refunded {money(original.refundedMinor, original.currency)} · can
						still refund {money(original.refundableMinor, original.currency)}
					</p>
				</div>
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
				}}
			/>
		</section>
	);
}
