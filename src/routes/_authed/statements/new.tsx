import {
	createFileRoute,
	Link,
	notFound,
	useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, CreditCard } from "lucide-react";
import { z } from "zod";

import { EmptyState } from "#/components/feedback";
import { BackLink, PageHeader } from "#/components/page-header";
import { Panel } from "#/components/panel";
import { RecordNotFound } from "#/components/route-fallbacks";
import { Button } from "#/components/ui/button";
import { listPaymentMethodsFn } from "#/features/payment-methods/payment-methods.functions";
import { StatementForm } from "#/features/statements/components/statement-form";
import {
	createStatementFn,
	getStatementDefaultsFn,
} from "#/features/statements/statements.functions";
import { pageTitle } from "#/lib/page-title";
import { notify } from "#/lib/toast";

export const Route = createFileRoute("/_authed/statements/new")({
	head: pageTitle("Add statement"),
	validateSearch: z.object({ cardId: z.uuid().optional().catch(undefined) }),
	loaderDeps: ({ search }) => search,
	loader: async ({ deps }) => {
		const cards = await listPaymentMethodsFn();
		// With a single active card there is nothing to choose.
		const cardId =
			deps.cardId ?? (cards.length === 1 ? cards[0]?.id : undefined);
		if (!cardId) return { cards, defaults: null };
		const defaults = await getStatementDefaultsFn({ data: { cardId } });
		// Null means no such card for this person; a real failure propagates as an error.
		if (!defaults) throw notFound();
		return { cards, defaults };
	},
	notFoundComponent: () => (
		<RecordNotFound
			title="That card could not be found"
			back={
				<Button asChild variant="outline">
					<Link to="/statements">Back to statements</Link>
				</Button>
			}
		/>
	),
	component: NewStatement,
});

function NewStatement() {
	const { cards, defaults } = Route.useLoaderData();
	const router = useRouter();
	const create = useServerFn(createStatementFn);
	const back = <BackLink to="/statements">Statements</BackLink>;

	if (!defaults) {
		return (
			<div className="max-w-2xl">
				<PageHeader
					back={back}
					title="Add statement"
					description={
						cards.length === 0 ? undefined : "Which card is this statement for?"
					}
				/>
				{cards.length === 0 ? (
					<Panel>
						<EmptyState
							icon={CreditCard}
							title="Add a card first"
							action={
								<Button asChild>
									<Link to="/cards/new">Add card</Link>
								</Button>
							}
						>
							Statements belong to a card.
						</EmptyState>
					</Panel>
				) : (
					<Panel aria-label="Cards">
						<ul className="divide-y">
							{cards.map((c) => (
								<li key={c.id}>
									<Link
										to="/statements/new"
										search={{ cardId: c.id }}
										className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-background/80 focus-visible:bg-background/80 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-5"
									>
										<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
											<CreditCard aria-hidden="true" className="size-4" />
										</span>
										<span className="min-w-0 flex-1">
											<span className="block font-medium">
												{c.name}{" "}
												<span className="tabular-nums">•••• {c.last4}</span>
											</span>
											<span className="block text-xs text-muted-foreground">
												{c.currency}
											</span>
										</span>
										<ChevronRight
											aria-hidden="true"
											className="size-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5"
										/>
									</Link>
								</li>
							))}
						</ul>
					</Panel>
				)}
			</div>
		);
	}

	const { card, suggestion, today } = defaults;
	return (
		<div className="max-w-2xl">
			<PageHeader
				back={back}
				title="Add statement"
				description="Copy the figures from the statement your bank sent."
			/>
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
					notify("Statement saved");
				}}
			/>
		</div>
	);
}
