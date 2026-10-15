import {
	createFileRoute,
	Link,
	notFound,
	useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { useState } from "react";

import { ConfirmDialog } from "#/components/confirm-dialog";
import { ActionError } from "#/components/feedback";
import { BackLink, PageHeader } from "#/components/page-header";
import {
	Figure,
	Panel,
	PanelHeader,
	Stat,
	StatGroup,
} from "#/components/panel";
import { RecordNotFound } from "#/components/route-fallbacks";
import { Button } from "#/components/ui/button";
import { PaymentForm } from "#/features/statements/components/payment-form";
import { StatementForm } from "#/features/statements/components/statement-form";
import { StatementStatusBadge } from "#/features/statements/components/statement-status";
import {
	addPaymentFn,
	deletePaymentFn,
	deleteStatementFn,
	getStatementFn,
	updateStatementFn,
} from "#/features/statements/statements.functions";
import { isUuid } from "#/lib/ids";
import {
	type CurrencyCode,
	formatMoney,
	minorToInputString,
} from "#/lib/money";
import { pageTitle } from "#/lib/page-title";
import { notify } from "#/lib/toast";
import { useAction } from "#/lib/use-action";

export const Route = createFileRoute("/_authed/statements/$statementId")({
	head: pageTitle("Statement"),
	loader: async ({ params }) => {
		if (!isUuid(params.statementId)) throw notFound();
		const result = await getStatementFn({ data: { id: params.statementId } });
		if (!result.statement) throw notFound();
		return { statement: result.statement, today: result.today };
	},
	notFoundComponent: () => (
		<RecordNotFound
			title="Statement not found"
			back={
				<Button asChild variant="outline">
					<Link to="/statements">Back to statements</Link>
				</Button>
			}
		/>
	),
	component: StatementDetail,
});

function StatementDetail() {
	const { statement: s, today } = Route.useLoaderData();
	const router = useRouter();
	const update = useServerFn(updateStatementFn);
	const addPayment = useServerFn(addPaymentFn);
	const removePayment = useServerFn(deletePaymentFn);
	const remove = useServerFn(deleteStatementFn);
	const { run, pending, error } = useAction();
	// One action runs at a time; its failure is shown next to the part of the page it came from.
	const [errorAt, setErrorAt] = useState<"payments" | "statement">("payments");
	const money = (minor: number) =>
		formatMoney(minor, s.currency as CurrencyCode);
	const cardLabel = `${s.card.name} •••• ${s.card.last4}`;

	return (
		<div>
			<PageHeader
				back={<BackLink to="/statements">Statements</BackLink>}
				title={cardLabel}
				badge={<StatementStatusBadge statement={s} />}
				description={
					<span className="tabular-nums">
						{s.periodStart} to {s.periodEnd}, due {s.dueDate}
					</span>
				}
			/>

			<div className="grid gap-6">
				<StatGroup pairs>
					<Stat label="Statement balance">
						<Figure>{money(s.balanceMinor)}</Figure>
					</Stat>
					<Stat label="Minimum due">
						<Figure>
							{s.minimumDueMinor === null ? "—" : money(s.minimumDueMinor)}
						</Figure>
					</Stat>
					<Stat label="Paid">
						<Figure>{money(s.paidMinor)}</Figure>
					</Stat>
					<Stat label={s.overpaidMinor > 0 ? "Credit" : "Still owed"}>
						<Figure
							className={
								s.status === "OVERDUE" && s.outstandingMinor > 0
									? "text-destructive"
									: undefined
							}
						>
							{money(
								s.overpaidMinor > 0 ? s.overpaidMinor : s.outstandingMinor,
							)}
						</Figure>
					</Stat>
				</StatGroup>

				<div className="grid items-start gap-6 lg:grid-cols-2">
					<Panel aria-labelledby="payments-title">
						<PanelHeader id="payments-title" title="Payments" />
						{s.payments.length === 0 ? (
							<p className="px-4 py-3 text-sm text-muted-foreground sm:px-5">
								No payments recorded yet.
							</p>
						) : (
							<ul className="divide-y text-sm">
								{s.payments.map((p) => (
									<li
										key={p.id}
										className="flex items-center justify-between gap-3 px-4 py-2 sm:px-5"
									>
										<div className="min-w-0">
											<p className="tabular-nums">{p.paidOn}</p>
											{p.notes && (
												<p className="truncate text-xs text-muted-foreground">
													{p.notes}
												</p>
											)}
										</div>
										<span className="flex items-center gap-1">
											<span className="font-medium tabular-nums">
												{money(p.amountMinor)}
											</span>
											<ConfirmDialog
												trigger={
													<Button
														variant="ghost"
														size="icon-sm"
														className="hover:bg-destructive-soft hover:text-destructive"
													>
														<Trash2 aria-hidden="true" />
														<span className="sr-only">
															Delete the payment of {money(p.amountMinor)} on{" "}
															{p.paidOn}
														</span>
													</Button>
												}
												title="Delete this payment?"
												description={`The ${money(p.amountMinor)} paid on ${p.paidOn} is removed and the amount owed goes back up.`}
												confirmLabel="Yes, delete"
												pending={pending}
												onConfirm={() => {
													setErrorAt("payments");
													return run(async () => {
														await removePayment({ data: { id: p.id } });
														notify("Payment deleted");
													});
												}}
											/>
										</span>
									</li>
								))}
							</ul>
						)}
						<div className="grid gap-3 border-t bg-background/40 px-4 py-4 sm:px-5">
							<div>
								<h3 className="text-sm font-semibold">Record a payment</h3>
								<p className="text-xs text-muted-foreground">
									Paying your card bill is not an expense, so it is not added to
									your transactions or spending.
								</p>
							</div>
							<PaymentForm
								key={`${s.payments.length}-${s.paidMinor}`}
								initialValues={{
									statementId: s.id,
									currency: s.currency as CurrencyCode,
									amount:
										s.outstandingMinor > 0
											? minorToInputString(
													s.outstandingMinor,
													s.currency as CurrencyCode,
												)
											: "",
									paidOn: today,
									notes: "",
								}}
								onSubmit={async (values) => {
									await addPayment({ data: values });
									await router.invalidate();
									notify("Payment recorded");
								}}
							/>
							{errorAt === "payments" && <ActionError error={error} />}
						</div>
					</Panel>

					<div className="grid gap-6">
						<section aria-labelledby="edit-title" className="grid gap-3">
							<h2 id="edit-title" className="text-[15px] font-semibold">
								Edit statement
							</h2>
							<StatementForm
								key={`${s.id}-${s.balanceMinor}-${s.dueDate}-${s.periodStart}-${s.periodEnd}`}
								cardLabel={cardLabel}
								submitLabel="Save changes"
								initialValues={{
									paymentMethodId: s.paymentMethodId,
									currency: s.currency as CurrencyCode,
									periodStart: s.periodStart,
									periodEnd: s.periodEnd,
									dueDate: s.dueDate,
									balance: minorToInputString(
										s.balanceMinor,
										s.currency as CurrencyCode,
									),
									minimumDue:
										s.minimumDueMinor === null
											? ""
											: minorToInputString(
													s.minimumDueMinor,
													s.currency as CurrencyCode,
												),
								}}
								onCancel={() => router.navigate({ to: "/statements" })}
								onSubmit={async (values) => {
									await update({ data: { id: s.id, values } });
									await router.invalidate();
									await router.navigate({ to: "/statements" });
									notify("Changes saved");
								}}
							/>
						</section>

						<section
							aria-labelledby="delete-title"
							className="grid gap-3 rounded-xl border border-dashed p-4 sm:p-5"
						>
							<div>
								<h2 id="delete-title" className="text-[15px] font-semibold">
									Delete statement
								</h2>
								<p className="mt-1 text-sm text-muted-foreground">
									This permanently removes the statement.
									{s.payments.length > 0 && " Delete its payments first."}
								</p>
							</div>
							{errorAt === "statement" && <ActionError error={error} />}
							<div>
								<ConfirmDialog
									trigger={
										<Button variant="destructive-outline" size="sm">
											<Trash2 aria-hidden="true" />
											Delete statement
										</Button>
									}
									title="Delete this statement?"
									description="The statement and its figures are removed. This cannot be undone."
									confirmLabel="Yes, delete it"
									pending={pending}
									onConfirm={() => {
										setErrorAt("statement");
										return run(async () => {
											await remove({ data: { id: s.id } });
											await router.navigate({ to: "/statements" });
											notify("Statement deleted");
										});
									}}
								/>
							</div>
						</section>
					</div>
				</div>
			</div>
		</div>
	);
}
