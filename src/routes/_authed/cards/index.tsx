import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { Button } from "#/components/ui/button";
import {
	listPaymentMethodsFn,
	setPaymentMethodArchivedFn,
} from "#/features/payment-methods/payment-methods.functions";
import type { CurrencyCode } from "#/lib/money";
import { formatMoney } from "#/lib/money";

export const Route = createFileRoute("/_authed/cards/")({
	validateSearch: z.object({ archived: z.boolean().optional() }),
	loaderDeps: ({ search }) => ({ archived: search.archived ?? false }),
	loader: ({ deps }) =>
		listPaymentMethodsFn({ data: { includeArchived: deps.archived } }),
	component: Cards,
});

function Cards() {
	const cards = Route.useLoaderData();
	const { archived = false } = Route.useSearch();
	const router = useRouter();
	const setArchived = useServerFn(setPaymentMethodArchivedFn);

	return (
		<section>
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-2xl font-semibold">Cards</h1>
				<div className="flex items-center gap-2">
					<Button asChild variant="ghost" size="sm">
						<Link
							to="/cards"
							search={{ archived: archived ? undefined : true }}
						>
							{archived ? "Hide archived" : "Show archived"}
						</Link>
					</Button>
					<Button asChild>
						<Link to="/cards/new">Add card</Link>
					</Button>
				</div>
			</div>

			{cards.length === 0 ? (
				<div className="rounded-xl border bg-card p-8 text-center">
					<p className="font-medium">No cards yet</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Add a credit card to link your subscriptions to it. Only the last
						four digits are stored.
					</p>
				</div>
			) : (
				<ul className="grid gap-3 sm:grid-cols-2">
					{cards.map((card) => (
						<li
							key={card.id}
							className="rounded-xl border bg-card p-4 shadow-sm"
						>
							<div className="flex items-start justify-between gap-2">
								<div>
									<p className="font-medium">
										{card.name}
										{card.archivedAt && (
											<span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
												Archived
											</span>
										)}
									</p>
									<p className="text-sm text-muted-foreground">
										{card.issuer ? `${card.issuer} · ` : ""}•••• {card.last4}
									</p>
								</div>
								<span className="text-sm font-medium">{card.currency}</span>
							</div>
							<dl className="mt-3 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
								<div>
									<dt>Limit</dt>
									<dd className="text-sm text-foreground">
										{card.creditLimitMinor === null
											? "—"
											: formatMoney(
													card.creditLimitMinor,
													card.currency as CurrencyCode,
												)}
									</dd>
								</div>
								<div>
									<dt>Statement</dt>
									<dd className="text-sm text-foreground">
										{card.statementDay ? `Day ${card.statementDay}` : "—"}
									</dd>
								</div>
								<div>
									<dt>Due</dt>
									<dd className="text-sm text-foreground">
										{card.paymentDueDay ? `Day ${card.paymentDueDay}` : "—"}
									</dd>
								</div>
							</dl>
							<div className="mt-3 flex gap-2">
								<Button asChild variant="outline" size="sm">
									<Link to="/cards/$cardId" params={{ cardId: card.id }}>
										Edit
									</Link>
								</Button>
								{!card.archivedAt && (
									<Button asChild variant="ghost" size="sm">
										<Link to="/statements/new" search={{ cardId: card.id }}>
											Add statement
										</Link>
									</Button>
								)}
								<Button
									variant="ghost"
									size="sm"
									onClick={async () => {
										await setArchived({
											data: { id: card.id, archived: !card.archivedAt },
										});
										await router.invalidate();
									}}
								>
									{card.archivedAt ? "Restore" : "Archive"}
								</Button>
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
