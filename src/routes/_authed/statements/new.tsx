import {
	createFileRoute,
	Link,
	notFound,
	useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { Button } from "#/components/ui/button";
import { listPaymentMethodsFn } from "#/features/payment-methods/payment-methods.functions";
import { StatementForm } from "#/features/statements/components/statement-form";
import {
	createStatementFn,
	getStatementDefaultsFn,
} from "#/features/statements/statements.functions";

export const Route = createFileRoute("/_authed/statements/new")({
	validateSearch: z.object({ cardId: z.uuid().optional().catch(undefined) }),
	loaderDeps: ({ search }) => search,
	loader: async ({ deps }) => {
		const cards = await listPaymentMethodsFn();
		// With a single active card there is nothing to choose.
		const cardId =
			deps.cardId ?? (cards.length === 1 ? cards[0]?.id : undefined);
		if (!cardId) return { cards, defaults: null };
		try {
			return {
				cards,
				defaults: await getStatementDefaultsFn({ data: { cardId } }),
			};
		} catch {
			throw notFound();
		}
	},
	notFoundComponent: () => (
		<p className="text-muted-foreground">That card could not be found.</p>
	),
	component: NewStatement,
});

function NewStatement() {
	const { cards, defaults } = Route.useLoaderData();
	const router = useRouter();
	const create = useServerFn(createStatementFn);

	if (!defaults) {
		return (
			<section className="grid max-w-xl gap-4">
				<h1 className="text-2xl font-semibold">Add statement</h1>
				{cards.length === 0 ? (
					<div className="rounded-xl border bg-card p-6">
						<p className="font-medium">Add a card first</p>
						<p className="mt-1 text-sm text-muted-foreground">
							Statements belong to a card.
						</p>
						<Button asChild className="mt-3">
							<Link to="/cards/new">Add card</Link>
						</Button>
					</div>
				) : (
					<div className="grid gap-2">
						<p className="text-sm text-muted-foreground">
							Which card is this statement for?
						</p>
						{cards.map((c) => (
							<Link
								key={c.id}
								to="/statements/new"
								search={{ cardId: c.id }}
								className="rounded-xl border bg-card p-3 shadow-sm hover:underline"
							>
								{c.name} •••• {c.last4} ({c.currency})
							</Link>
						))}
					</div>
				)}
			</section>
		);
	}

	const { card, suggestion, today } = defaults;
	return (
		<section className="grid gap-4">
			<h1 className="text-2xl font-semibold">Add statement</h1>
			<StatementForm
				key={card.id}
				cardLabel={`${card.name} •••• ${card.last4}`}
				submitLabel="Save statement"
				initialValues={{
					paymentMethodId: card.id,
					currency: card.currency as "NPR",
					periodStart: suggestion?.periodStart ?? "",
					periodEnd: suggestion?.periodEnd ?? today,
					dueDate: suggestion?.dueDate ?? "",
					balance: "",
					minimumDue: "",
				}}
				onCancel={() => router.navigate({ to: "/statements" })}
				onSubmit={async (values) => {
					const { id } = await create({ data: values });
					await router.invalidate();
					await router.navigate({
						to: "/statements/$statementId",
						params: { statementId: id },
					});
				}}
			/>
		</section>
	);
}
