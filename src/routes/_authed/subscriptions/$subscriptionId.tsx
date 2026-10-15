import {
	createFileRoute,
	Link,
	notFound,
	useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Archive, ArchiveRestore, ReceiptText } from "lucide-react";
import { useState } from "react";

import { ActionError, StatusBadge } from "#/components/feedback";
import { Money } from "#/components/money";
import { BackLink, PageHeader } from "#/components/page-header";
import { Panel, PanelHeader } from "#/components/panel";
import { RecordNotFound } from "#/components/route-fallbacks";
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
import { describeInterval } from "#/features/subscriptions/subscriptions.logic";
import { isUuid } from "#/lib/ids";
import type { CurrencyCode } from "#/lib/money";
import { minorToInputString } from "#/lib/money";
import { pageTitle } from "#/lib/page-title";
import { notify } from "#/lib/toast";
import { useAction } from "#/lib/use-action";

export const Route = createFileRoute("/_authed/subscriptions/$subscriptionId")({
	head: pageTitle("Edit subscription"),
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
		<RecordNotFound
			title="Subscription not found"
			back={
				<Button asChild variant="outline">
					<Link to="/subscriptions">Back to subscriptions</Link>
				</Button>
			}
		/>
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
	const { run, pending, error } = useAction();
	const active = s.status === "ACTIVE";

	return (
		<div>
			<PageHeader
				back={<BackLink to="/subscriptions">Subscriptions</BackLink>}
				title={s.name}
				badge={
					<>
						{!active && <StatusBadge>Cancelled</StatusBadge>}
						{s.archived && <StatusBadge>Archived</StatusBadge>}
					</>
				}
				description={
					<>
						<Money
							minor={s.amountMinor}
							currency={s.currency}
							className="font-semibold text-foreground"
						/>{" "}
						{describeInterval(s.intervalCount, s.intervalUnit).toLowerCase()}
					</>
				}
				actions={
					<Button asChild variant="outline">
						<Link to="/transactions/new" search={{ subscriptionId: s.id }}>
							<ReceiptText aria-hidden="true" />
							Record charge
						</Link>
					</Button>
				}
			/>

			<div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
				<section aria-labelledby="edit-title" className="grid gap-3">
					<h2 id="edit-title" className="text-[15px] font-semibold">
						Details
					</h2>
					<SubscriptionForm
						// Cancel and Reactivate change `expiresOn` on the server. A form the user has
						// already touched keeps its old values, so pressing "Save changes" afterwards
						// would write the stale end date back. Re-initialise it when they change.
						key={`${s.status}|${s.expiresOn ?? ""}|${s.cancelledOn ?? ""}`}
						cards={cards}
						submitLabel="Save changes"
						initialValues={{
							name: s.name,
							amount: minorToInputString(
								s.amountMinor,
								s.currency as CurrencyCode,
							),
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
							notify("Changes saved");
						}}
					/>
				</section>

				<aside className="grid gap-6 lg:pt-9">
					<Panel aria-labelledby="status-title">
						<PanelHeader
							id="status-title"
							title={active ? "Cancel subscription" : "Cancelled"}
							description={
								!active && s.cancelledOn ? (
									<span className="tabular-nums">On {s.cancelledOn}</span>
								) : undefined
							}
						/>
						<div className="grid gap-4 px-4 py-4 sm:px-5">
							{active ? (
								<>
									<p className="text-sm text-muted-foreground">
										Marks it as cancelled and stops expected renewals. The
										record and history are kept.
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
											variant="destructive-outline"
											disabled={pending}
											onClick={async () => {
												const outcome = await run(() =>
													cancel({ data: { id: s.id, expiresOn: endDate } }),
												);
												if (outcome === "done")
													notify("Subscription cancelled");
											}}
										>
											Mark as cancelled
										</Button>
									</div>
								</>
							) : (
								<>
									<p className="text-sm text-muted-foreground">
										No renewals are expected. Reactivate it if you are paying
										for it again.
									</p>
									<div>
										<Button
											variant="outline"
											disabled={pending}
											onClick={async () => {
												const outcome = await run(() =>
													reactivate({ data: { id: s.id } }),
												);
												if (outcome === "done")
													notify("Subscription reactivated");
											}}
										>
											Reactivate
										</Button>
									</div>
								</>
							)}
							<ActionError error={error} />
						</div>
					</Panel>

					<section
						aria-labelledby="archive-title"
						className="grid gap-3 rounded-xl border border-dashed p-4 sm:p-5"
					>
						<div>
							<h2 id="archive-title" className="text-[15px] font-semibold">
								{s.archived ? "Archived" : "Archive"}
							</h2>
							<p className="mt-1 text-sm text-muted-foreground">
								{s.archived
									? "Hidden from your subscription list. Its history is kept."
									: "Hide it from your lists once you no longer need it. Its history is kept."}
							</p>
						</div>
						<div>
							<Button
								variant="outline"
								size="sm"
								disabled={pending}
								onClick={async () => {
									const outcome = await run(() =>
										setArchived({ data: { id: s.id, archived: !s.archived } }),
									);
									if (outcome === "done")
										notify(
											s.archived
												? "Subscription restored"
												: "Subscription archived",
										);
								}}
							>
								{s.archived ? (
									<ArchiveRestore aria-hidden="true" />
								) : (
									<Archive aria-hidden="true" />
								)}
								{s.archived ? "Restore from archive" : "Archive"}
							</Button>
						</div>
					</section>
				</aside>
			</div>
		</div>
	);
}
