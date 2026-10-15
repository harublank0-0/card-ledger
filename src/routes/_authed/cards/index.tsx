import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "cn";
import {
	Archive,
	ArchiveRestore,
	CreditCard,
	Ellipsis,
	FilePlus,
	Pencil,
	Plus,
} from "lucide-react";
import { z } from "zod";

import { ActionError, EmptyState, StatusBadge } from "#/components/feedback";
import { Money } from "#/components/money";
import { PageHeader } from "#/components/page-header";
import { Panel } from "#/components/panel";
import {
	segmentedGroupClass,
	segmentedItemClass,
} from "#/components/segmented";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
	listPaymentMethodsFn,
	setPaymentMethodArchivedFn,
} from "#/features/payment-methods/payment-methods.functions";
import { pageTitle } from "#/lib/page-title";
import { notify } from "#/lib/toast";
import { useAction } from "#/lib/use-action";

export const Route = createFileRoute("/_authed/cards/")({
	head: pageTitle("Cards"),
	validateSearch: z.object({
		archived: z.boolean().optional().catch(undefined),
	}),
	loaderDeps: ({ search }) => ({ archived: search.archived ?? false }),
	loader: ({ deps }) =>
		listPaymentMethodsFn({ data: { includeArchived: deps.archived } }),
	component: Cards,
});

const dayLabel = (day: number | null) => (day ? `Day ${day}` : "—");

/** The contact chip printed on a card; decoration only. */
function Chip() {
	return (
		<svg
			viewBox="0 0 34 26"
			aria-hidden="true"
			className="h-[26px] w-[34px] opacity-80"
		>
			<rect width="34" height="26" rx="5" fill="#C3CCD7" opacity="0.55" />
			<g stroke="#18212F" strokeOpacity="0.45" strokeWidth="1" fill="none">
				<path d="M0 9h11M0 17h11M23 9h11M23 17h11M11 0v26M23 0v26" />
				<rect x="11" y="6" width="12" height="14" rx="3" />
			</g>
		</svg>
	);
}

function Cards() {
	const cards = Route.useLoaderData();
	const { run, pending, error } = useAction();
	const setArchived = useServerFn(setPaymentMethodArchivedFn);

	return (
		<div>
			<PageHeader
				title="Cards"
				description="The credit cards you pay with. Only the last four digits are stored."
				actions={
					<>
						<nav aria-label="Which cards" className={segmentedGroupClass}>
							<Link
								to="/cards"
								search={{}}
								activeOptions={{ exact: true }}
								className={segmentedItemClass}
							>
								In use
							</Link>
							<Link
								to="/cards"
								search={{ archived: true }}
								activeOptions={{ exact: true }}
								className={segmentedItemClass}
							>
								Including archived
							</Link>
						</nav>
						<Button asChild>
							<Link to="/cards/new">
								<Plus aria-hidden="true" />
								Add card
							</Link>
						</Button>
					</>
				}
			/>

			<div className="grid gap-4">
				<ActionError error={error} />
				{cards.length === 0 ? (
					<Panel>
						<EmptyState
							icon={CreditCard}
							title="No cards yet"
							action={
								<Button asChild variant="outline">
									<Link to="/cards/new">Add card</Link>
								</Button>
							}
						>
							Add a credit card to link your subscriptions to it. Only the last
							four digits are stored.
						</EmptyState>
					</Panel>
				) : (
					<ul className="grid gap-x-6 gap-y-8 sm:grid-cols-2 xl:grid-cols-3">
						{cards.map((card) => (
							<li key={card.id} className="grid gap-3">
								<Link
									to="/cards/$cardId"
									params={{ cardId: card.id }}
									className={cn(
										"relative block aspect-[1.586/1] overflow-hidden rounded-2xl bg-sidebar p-5 text-sidebar-foreground shadow-raised transition-transform duration-200 ease-out-soft hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
										card.archivedAt && "opacity-60 grayscale",
									)}
								>
									<span
										aria-hidden="true"
										className="absolute -top-20 -right-12 size-56 rounded-full bg-white/[0.035]"
									/>
									<span
										aria-hidden="true"
										className="absolute top-10 -right-28 size-56 rounded-full bg-white/[0.035]"
									/>
									<span className="relative flex h-full flex-col justify-between">
										<span className="flex items-start justify-between gap-3">
											<span className="min-w-0">
												<span className="sr-only">Edit </span>
												<span className="block truncate text-[15px] font-semibold text-white">
													{card.name}
												</span>
												<span className="block truncate text-xs text-sidebar-muted">
													{card.issuer || "Credit card"}
												</span>
											</span>
											<span className="rounded-md border border-white/15 px-1.5 py-0.5 text-[11px] font-medium tracking-wide text-sidebar-muted">
												{card.currency}
											</span>
										</span>
										<Chip />
										<span className="flex items-end justify-between gap-3">
											<span className="text-lg tracking-[0.18em] text-white tabular-nums">
												•••• {card.last4}
											</span>
											<span className="text-right">
												<span className="block text-[10px] tracking-wide text-sidebar-subtle">
													Limit
												</span>
												{card.creditLimitMinor === null ? (
													<span className="text-sm text-sidebar-muted">—</span>
												) : (
													<Money
														minor={card.creditLimitMinor}
														currency={card.currency}
														className="text-sm font-medium text-white"
														codeClassName="text-sidebar-muted"
													/>
												)}
											</span>
										</span>
									</span>
								</Link>

								<div className="flex items-center justify-between gap-3 px-1">
									<dl className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
										<div>
											<dt className="text-muted-foreground">Statement</dt>
											<dd className="font-medium">
												{dayLabel(card.statementDay)}
											</dd>
										</div>
										<div>
											<dt className="text-muted-foreground">Payment due</dt>
											<dd className="font-medium">
												{dayLabel(card.paymentDueDay)}
											</dd>
										</div>
										{card.archivedAt && (
											<div className="self-center">
												<dt className="sr-only">State</dt>
												<dd>
													<StatusBadge>Archived</StatusBadge>
												</dd>
											</div>
										)}
									</dl>
									<DropdownMenu modal={false}>
										<DropdownMenuTrigger asChild>
											<Button
												variant="ghost"
												size="icon-sm"
												className="data-[state=open]:bg-accent data-[state=open]:text-foreground"
												disabled={pending}
											>
												<Ellipsis aria-hidden="true" />
												<span className="sr-only">Actions for {card.name}</span>
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem asChild>
												<Link to="/cards/$cardId" params={{ cardId: card.id }}>
													<Pencil aria-hidden="true" />
													Edit card
												</Link>
											</DropdownMenuItem>
											{!card.archivedAt && (
												<DropdownMenuItem asChild>
													<Link
														to="/statements/new"
														search={{ cardId: card.id }}
													>
														<FilePlus aria-hidden="true" />
														Add statement
													</Link>
												</DropdownMenuItem>
											)}
											<DropdownMenuSeparator />
											<DropdownMenuItem
												onSelect={async () => {
													const outcome = await run(() =>
														setArchived({
															data: {
																id: card.id,
																archived: !card.archivedAt,
															},
														}),
													);
													if (outcome === "done")
														notify(
															card.archivedAt
																? "Card restored"
																: "Card archived",
														);
												}}
											>
												{card.archivedAt ? (
													<ArchiveRestore aria-hidden="true" />
												) : (
													<Archive aria-hidden="true" />
												)}
												{card.archivedAt ? "Restore" : "Archive"}
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
