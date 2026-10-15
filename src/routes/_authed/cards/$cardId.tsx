import {
	createFileRoute,
	Link,
	notFound,
	useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { BackLink, PageHeader } from "#/components/page-header";
import { RecordNotFound } from "#/components/route-fallbacks";
import { Button } from "#/components/ui/button";
import { CardForm } from "#/features/payment-methods/components/card-form";
import {
	getPaymentMethodFn,
	updatePaymentMethodFn,
} from "#/features/payment-methods/payment-methods.functions";
import { isUuid } from "#/lib/ids";
import type { CurrencyCode } from "#/lib/money";
import { minorToInputString } from "#/lib/money";
import { pageTitle } from "#/lib/page-title";
import { notify } from "#/lib/toast";

export const Route = createFileRoute("/_authed/cards/$cardId")({
	head: pageTitle("Edit card"),
	loader: async ({ params }) => {
		if (!isUuid(params.cardId)) throw notFound();
		const card = await getPaymentMethodFn({ data: { id: params.cardId } });
		if (!card) throw notFound();
		return card;
	},
	notFoundComponent: () => (
		<RecordNotFound
			title="Card not found"
			back={
				<Button asChild variant="outline">
					<Link to="/cards">Back to cards</Link>
				</Button>
			}
		/>
	),
	component: EditCard,
});

function EditCard() {
	const card = Route.useLoaderData();
	const router = useRouter();
	const update = useServerFn(updatePaymentMethodFn);

	return (
		<div className="max-w-2xl">
			<PageHeader
				back={<BackLink to="/cards">Cards</BackLink>}
				title="Edit card"
				description={
					<>
						{card.name} <span className="tabular-nums">•••• {card.last4}</span>
					</>
				}
			/>
			<CardForm
				submitLabel="Save changes"
				initialValues={{
					name: card.name,
					issuer: card.issuer ?? "",
					last4: card.last4,
					currency: card.currency as CurrencyCode,
					creditLimit:
						card.creditLimitMinor === null
							? ""
							: minorToInputString(
									card.creditLimitMinor,
									card.currency as CurrencyCode,
								),
					statementDay: card.statementDay?.toString() ?? "",
					paymentDueDay: card.paymentDueDay?.toString() ?? "",
				}}
				onCancel={() => router.navigate({ to: "/cards" })}
				onSubmit={async (values) => {
					await update({ data: { id: card.id, values } });
					await router.invalidate();
					await router.navigate({ to: "/cards" });
					notify("Changes saved");
				}}
			/>
		</div>
	);
}
