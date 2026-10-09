import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { CardForm } from "#/features/payment-methods/components/card-form";
import { createPaymentMethodFn } from "#/features/payment-methods/payment-methods.functions";

export const Route = createFileRoute("/_authed/cards/new")({
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
