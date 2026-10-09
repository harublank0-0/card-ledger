import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { listPaymentMethodsFn } from "#/features/payment-methods/payment-methods.functions";
import { SubscriptionForm } from "#/features/subscriptions/components/subscription-form";
import { createSubscriptionFn } from "#/features/subscriptions/subscriptions.functions";
import { todayIn } from "#/lib/calendar-date";

export const Route = createFileRoute("/_authed/subscriptions/new")({
	loader: () => listPaymentMethodsFn(),
	component: NewSubscription,
});

function NewSubscription() {
	const cards = Route.useLoaderData();
	const router = useRouter();
	const create = useServerFn(createSubscriptionFn);

	return (
		<section>
			<h1 className="mb-4 text-2xl font-semibold">Add subscription</h1>
			<SubscriptionForm
				cards={cards}
				submitLabel="Save subscription"
				initialValues={{
					name: "",
					amount: "",
					currency: "NPR",
					intervalCount: "1",
					intervalUnit: "MONTH",
					anchorDate: todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone),
					paymentMethodId: "",
					autoRenew: true,
					expiresOn: "",
					cancellationDeadline: "",
					notes: "",
				}}
				onCancel={() => router.navigate({ to: "/subscriptions" })}
				onSubmit={async (values) => {
					await create({ data: values });
					await router.invalidate();
					await router.navigate({ to: "/subscriptions" });
				}}
			/>
		</section>
	);
}
