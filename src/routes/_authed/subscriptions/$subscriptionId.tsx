import {
	createFileRoute,
	Link,
	notFound,
	useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Label } from "#/components/ui/label";
import { listPaymentMethodsFn } from "#/features/payment-methods/payment-methods.functions";
import { SubscriptionForm } from "#/features/subscriptions/components/subscription-form";
import {
	cancelSubscriptionFn,
	getSubscriptionFn,
	reactivateSubscriptionFn,
	setSubscriptionArchivedFn,
	updateSubscriptionFn,
} from "#/features/subscriptions/subscriptions.functions";
import { isUuid } from "#/lib/ids";
import type { CurrencyCode } from "#/lib/money";
import { minorToInputString } from "#/lib/money";

export const Route = createFileRoute("/_authed/subscriptions/$subscriptionId")({
	loader: async ({ params }) => {
		if (!isUuid(params.subscriptionId)) throw notFound();
		const [subscription, cards] = await Promise.all([
			getSubscriptionFn({ data: { id: params.subscriptionId } }),
			listPaymentMethodsFn(),
		]);
		if (!subscription) throw notFound();
		// A card that is archived but still linked must remain selectable on this page.
		const linked = subscription.paymentMethod;
		const options =
			linked && !cards.some((c) => c.id === linked.id)
				? [...cards, linked]
				: cards;
		return { subscription, cards: options };
	},
	notFoundComponent: () => (
		<p className="text-muted-foreground">Subscription not found.</p>
	),
	component: EditSubscription,
});

function EditSubscription() {
	const { subscription: s, cards } = Route.useLoaderData();
	const router = useRouter();
	const update = useServerFn(updateSubscriptionFn);
	const cancel = useServerFn(cancelSubscriptionFn);
	const reactivate = useServerFn(reactivateSubscriptionFn);
	const setArchived = useServerFn(setSubscriptionArchivedFn);
	const [endDate, setEndDate] = useState("");
	const [error, setError] = useState<string | null>(null);

	const refresh = () => router.invalidate();
	const run = async (action: () => Promise<unknown>) => {
		setError(null);
		try {
			await action();
			await refresh();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Something went wrong");
		}
	};

	return (
		<section className="grid gap-6">
			<h1 className="text-2xl font-semibold">{s.name}</h1>

			<div className="grid max-w-xl gap-3 rounded-xl border bg-card p-5 shadow-sm">
				{s.status === "ACTIVE" ? (
					<>
						<p className="text-sm font-medium">Cancel subscription</p>
						<p className="text-sm text-muted-foreground">
							Marks it as cancelled and stops expected renewals. The record and
							history are kept.
						</p>
						<div className="grid gap-1.5">
							<Label htmlFor="endDate">Access ends on (optional)</Label>
							<Input
								id="endDate"
								type="date"
								value={endDate}
								onChange={(e) => setEndDate(e.target.value)}
							/>
						</div>
						<div>
							<Button
								variant="destructive"
								onClick={() =>
									run(() => cancel({ data: { id: s.id, expiresOn: endDate } }))
								}
							>
								Mark as cancelled
							</Button>
						</div>
					</>
				) : (
					<>
						<p className="text-sm font-medium">
							Cancelled{s.cancelledOn ? ` on ${s.cancelledOn}` : ""}
						</p>
						<div>
							<Button
								variant="outline"
								onClick={() => run(() => reactivate({ data: { id: s.id } }))}
							>
								Reactivate
							</Button>
						</div>
					</>
				)}
				<div>
					<Button asChild variant="outline" size="sm">
						<Link to="/transactions/new" search={{ subscriptionId: s.id }}>
							Record charge
						</Link>
					</Button>
				</div>
				<div>
					<Button
						variant="ghost"
						size="sm"
						onClick={() =>
							run(() =>
								setArchived({ data: { id: s.id, archived: !s.archived } }),
							)
						}
					>
						{s.archived ? "Restore from archive" : "Archive"}
					</Button>
				</div>
				{error && (
					<p role="alert" className="text-sm text-destructive">
						{error}
					</p>
				)}
			</div>

			<SubscriptionForm
				// Cancel and Reactivate change `expiresOn` on the server. A form the user has
				// already touched keeps its old values, so pressing "Save changes" afterwards
				// would write the stale end date back. Re-initialise it when they change.
				key={`${s.status}|${s.expiresOn ?? ""}|${s.cancelledOn ?? ""}`}
				cards={cards}
				submitLabel="Save changes"
				initialValues={{
					name: s.name,
					amount: minorToInputString(s.amountMinor, s.currency as CurrencyCode),
					currency: s.currency as CurrencyCode,
					intervalCount: String(s.intervalCount),
					intervalUnit: s.intervalUnit,
					anchorDate: s.anchorDate,
					paymentMethodId: s.paymentMethodId ?? "",
					autoRenew: s.autoRenew,
					expiresOn: s.expiresOn ?? "",
					cancellationDeadline: s.cancellationDeadline ?? "",
					notes: s.notes ?? "",
				}}
				onCancel={() => router.navigate({ to: "/subscriptions" })}
				onSubmit={async (values) => {
					await update({ data: { id: s.id, values } });
					await router.invalidate();
					await router.navigate({ to: "/subscriptions" });
				}}
			/>
		</section>
	);
}
