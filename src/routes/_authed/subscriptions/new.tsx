import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { BackLink, PageHeader } from "#/components/page-header";
import { getTodayFn } from "#/features/notifications/notifications.functions";
import { listPaymentMethodsFn } from "#/features/payment-methods/payment-methods.functions";
import { SubscriptionForm } from "#/features/subscriptions/components/subscription-form";
import { createSubscriptionFn } from "#/features/subscriptions/subscriptions.functions";
import { pageTitle } from "#/lib/page-title";
import { notify } from "#/lib/toast";

export const Route = createFileRoute("/_authed/subscriptions/new")({
	head: pageTitle("Add subscription"),
	loader: async () => {
		const [cards, today] = await Promise.all([
			listPaymentMethodsFn(),
			getTodayFn(),
		]);
		return { cards, today };
	},
	component: NewSubscription,
});

function NewSubscription() {
	const { cards, today } = Route.useLoaderData();
	const router = useRouter();
	const create = useServerFn(createSubscriptionFn);

	return (
		<div className="max-w-2xl">
			<PageHeader
				back={<BackLink to="/subscriptions">Subscriptions</BackLink>}
				title="Add subscription"
				description="Something you pay for on a schedule. Renewals are worked out from the billing date."
			/>
			<SubscriptionForm
				cards={cards}
				submitLabel="Save subscription"
				initialValues={{
					name: "",
					amount: "",
					currency: "NPR",
					intervalCount: "1",
					intervalUnit: "MONTH",
					anchorDate: today,
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
					notify("Subscription saved");
				}}
			/>
		</div>
	);
}
