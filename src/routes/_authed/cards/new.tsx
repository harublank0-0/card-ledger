import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { CardForm } from "#/features/payment-methods/components/card-form";
import { createPaymentMethodFn } from "#/features/payment-methods/payment-methods.functions";
import { pageTitle } from "#/lib/page-title";

export const Route = createFileRoute("/_authed/cards/new")({
	head: pageTitle("Add card"),
	component: NewCard,
});

function NewCard() {
	const router = useRouter();
	const create = useServerFn(createPaymentMethodFn);

	return (
		<section>
			<h1 className="mb-4 text-2xl font-semibold">Add card</h1>
			<CardForm
				submitLabel="Save card"
				onCancel={() => router.navigate({ to: "/cards" })}
				onSubmit={async (values) => {
					await create({ data: values });
					await router.invalidate();
					await router.navigate({ to: "/cards" });
				}}
			/>
		</section>
	);
}
