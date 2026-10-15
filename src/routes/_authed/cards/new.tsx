import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { BackLink, PageHeader } from "#/components/page-header";
import { CardForm } from "#/features/payment-methods/components/card-form";
import { createPaymentMethodFn } from "#/features/payment-methods/payment-methods.functions";
import { pageTitle } from "#/lib/page-title";
import { notify } from "#/lib/toast";

export const Route = createFileRoute("/_authed/cards/new")({
	head: pageTitle("Add card"),
	component: NewCard,
});

function NewCard() {
	const router = useRouter();
	const create = useServerFn(createPaymentMethodFn);

	return (
		<div className="max-w-2xl">
			<PageHeader
				back={<BackLink to="/cards">Cards</BackLink>}
				title="Add card"
				description="A card you pay with, so transactions, subscriptions and statements can point to it."
			/>
			<CardForm
				submitLabel="Save card"
				onCancel={() => router.navigate({ to: "/cards" })}
				onSubmit={async (values) => {
					await create({ data: values });
					await router.invalidate();
					await router.navigate({ to: "/cards" });
					notify("Card saved");
				}}
			/>
		</div>
	);
}
