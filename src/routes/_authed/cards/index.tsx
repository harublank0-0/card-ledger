import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
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
	rowLinkClass,
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import {
	listPaymentMethodsFn,
	setPaymentMethodArchivedFn,
} from "#/features/payment-methods/payment-methods.functions";
import type { CurrencyCode } from "#/lib/money";
import { formatMoney } from "#/lib/money";
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
					<Button asChild>
						<Link to="/cards/new">
							<Plus aria-hidden="true" />
							Add card
						</Link>
					</Button>
				}
			/>

			<div className="grid gap-4">
				<ActionError error={error} />
				<Panel aria-label="Cards">
					<div className="flex items-center justify-between gap-3 border-b bg-background/50 px-4 py-3 sm:px-5">
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
					</div>

					{cards.length === 0 ? (
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
					) : (
						<Table>
							<caption className="sr-only">Cards</caption>
							<TableHeader>
								<TableRow>
									<TableHead>Card</TableHead>
									<TableHead className="hidden sm:table-cell">
										Currency
									</TableHead>
									<TableHead numeric className="hidden md:table-cell">
										Credit limit
									</TableHead>
									<TableHead className="hidden md:table-cell">
										Statement
									</TableHead>
									<TableHead className="hidden md:table-cell">
										Payment due
									</TableHead>
									<TableHead className="w-0">
										<span className="sr-only">Actions</span>
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{cards.map((card) => (
									<TableRow key={card.id} interactive>
										<TableCell className="w-full max-w-0 md:max-w-none">
											<div className="flex items-center gap-3">
												<span className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground sm:flex">
													<CreditCard aria-hidden="true" className="size-4" />
												</span>
												<div className="min-w-0">
													<div className="flex flex-wrap items-center gap-x-2 gap-y-1">
														<Link
															to="/cards/$cardId"
															params={{ cardId: card.id }}
															className={rowLinkClass}
														>
															{card.name}
														</Link>
														{card.archivedAt && (
															<StatusBadge>Archived</StatusBadge>
														)}
													</div>
													<p className="truncate text-xs text-muted-foreground">
														{card.issuer ? `${card.issuer} · ` : ""}
														<span className="tabular-nums">
															•••• {card.last4}
														</span>
														<span className="sm:hidden">
															{" "}
															· {card.currency}
														</span>
													</p>
												</div>
											</div>
										</TableCell>
										<TableCell className="hidden align-middle sm:table-cell">
											{card.currency}
										</TableCell>
										<TableCell
											numeric
											className="hidden align-middle font-normal md:table-cell"
										>
											{card.creditLimitMinor === null
												? "—"
												: formatMoney(
														card.creditLimitMinor,
														card.currency as CurrencyCode,
													)}
										</TableCell>
										<TableCell className="hidden align-middle whitespace-nowrap text-muted-foreground md:table-cell">
											{dayLabel(card.statementDay)}
										</TableCell>
										<TableCell className="hidden align-middle whitespace-nowrap text-muted-foreground md:table-cell">
											{dayLabel(card.paymentDueDay)}
										</TableCell>
										<TableCell className="py-2 pl-1 align-middle">
											<DropdownMenu modal={false}>
												<DropdownMenuTrigger asChild>
													<Button
														variant="ghost"
														size="icon-sm"
														className="relative z-10 data-[state=open]:bg-accent data-[state=open]:text-foreground"
														disabled={pending}
													>
														<Ellipsis aria-hidden="true" />
														<span className="sr-only">
															Actions for {card.name}
														</span>
													</Button>
												</DropdownMenuTrigger>
												<DropdownMenuContent align="end">
													<DropdownMenuItem asChild>
														<Link
															to="/cards/$cardId"
															params={{ cardId: card.id }}
														>
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
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</Panel>
			</div>
		</div>
	);
}
