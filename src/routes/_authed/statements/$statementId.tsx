import {
	createFileRoute,
	Link,
	notFound,
	useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { PaymentForm } from "#/features/statements/components/payment-form";
import { StatementForm } from "#/features/statements/components/statement-form";
import {
	addPaymentFn,
	deletePaymentFn,
	deleteStatementFn,
	getStatementFn,
	updateStatementFn,
} from "#/features/statements/statements.functions";
import { statusLabel } from "#/features/statements/statements.logic";
import { isUuid } from "#/lib/ids";
import {
	type CurrencyCode,
	formatMoney,
	minorToInputString,
} from "#/lib/money";
import { pageTitle } from "#/lib/page-title";
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
		<p className="text-muted-foreground">Statement not found.</p>
	),
	component: StatementDetail,
});

const TONE = {
	danger: "bg-destructive/10 text-destructive",
	neutral: "bg-secondary text-muted-foreground",
	success: "bg-emerald-100 text-emerald-800",
} as const;

function StatementDetail() {
	const { statement: s, today } = Route.useLoaderData();
	const router = useRouter();
	const update = useServerFn(updateStatementFn);
	const addPayment = useServerFn(addPaymentFn);
	const removePayment = useServerFn(deletePaymentFn);
	const remove = useServerFn(deleteStatementFn);
	const [confirmingPayment, setConfirmingPayment] = useState<string | null>(
		null,
	);
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const { run, pending, error } = useAction();
	const money = (minor: number) =>
		formatMoney(minor, s.currency as CurrencyCode);
	const label = statusLabel(s);

	return (
		<section className="grid gap-6">
			<div>
				<h1 className="text-2xl font-semibold">
					{s.card.name} •••• {s.card.last4}
					<span
						className={`ml-2 rounded px-1.5 py-0.5 align-middle text-xs ${TONE[label.tone]}`}
					>
						{label.label}
					</span>
				</h1>
				<p className="text-muted-foreground">
					{s.periodStart} to {s.periodEnd} · due {s.dueDate}
				</p>
			</div>

			<div className="grid max-w-xl gap-3 rounded-xl border bg-card p-5 shadow-sm">
				<dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
					<div>
						<dt className="text-muted-foreground">Statement balance</dt>
						<dd className="font-medium">{money(s.balanceMinor)}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Minimum due</dt>
						<dd className="font-medium">
							{s.minimumDueMinor === null ? "—" : money(s.minimumDueMinor)}
						</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">Paid</dt>
						<dd className="font-medium">{money(s.paidMinor)}</dd>
					</div>
					<div>
						<dt className="text-muted-foreground">
							{s.overpaidMinor > 0 ? "Credit" : "Still owed"}
						</dt>
						<dd className="font-medium">
							{money(
								s.overpaidMinor > 0 ? s.overpaidMinor : s.outstandingMinor,
							)}
						</dd>
					</div>
				</dl>
			</div>

			<div className="grid max-w-xl gap-4 rounded-xl border bg-card p-5 shadow-sm">
				<p className="text-sm font-medium">Payments</p>
				{s.payments.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						No payments recorded yet.
					</p>
				) : (
					<ul className="grid gap-2 text-sm">
						{s.payments.map((p) => (
							<li
								key={p.id}
								className="flex items-center justify-between gap-3"
							>
								<span>
									{p.paidOn}
									{p.notes && (
										<span className="text-muted-foreground"> · {p.notes}</span>
									)}
								</span>
								<span className="flex items-center gap-2">
									<span className="font-medium">{money(p.amountMinor)}</span>
									{confirmingPayment === p.id ? (
										<>
											<Button
												size="sm"
												variant="destructive"
												disabled={pending}
												onClick={() =>
													run(async () => {
														await removePayment({ data: { id: p.id } });
														setConfirmingPayment(null);
													})
												}
											>
												Yes, delete
											</Button>
											<Button
												size="sm"
												variant="ghost"
												onClick={() => setConfirmingPayment(null)}
											>
												Keep
											</Button>
										</>
									) : (
										<Button
											size="sm"
											variant="ghost"
											onClick={() => setConfirmingPayment(p.id)}
										>
											Delete
										</Button>
									)}
								</span>
							</li>
						))}
					</ul>
				)}
				<div className="border-t pt-4">
					<p className="mb-2 text-sm font-medium">Record a payment</p>
					<p className="mb-3 text-xs text-muted-foreground">
						Paying your card bill is not an expense, so it is not added to your
						transactions or spending.
					</p>
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
						}}
					/>
				</div>
				{error && (
					<p role="alert" className="text-sm text-destructive">
						{error}
					</p>
				)}
			</div>

			<div className="grid gap-2">
				<p className="text-sm font-medium">Edit statement</p>
				<StatementForm
					key={`${s.id}-${s.balanceMinor}-${s.dueDate}-${s.periodStart}-${s.periodEnd}`}
					cardLabel={`${s.card.name} •••• ${s.card.last4}`}
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
					}}
				/>
			</div>

			<div className="grid max-w-xl gap-3 rounded-xl border bg-card p-5 shadow-sm">
				<p className="text-sm font-medium">Delete statement</p>
				<p className="text-sm text-muted-foreground">
					This permanently removes the statement.
					{s.payments.length > 0 && " Delete its payments first."}
				</p>
				{confirmingDelete ? (
					<div className="flex gap-2">
						<Button
							variant="destructive"
							disabled={pending}
							onClick={() =>
								run(async () => {
									await remove({ data: { id: s.id } });
									await router.navigate({ to: "/statements" });
								}).finally(() => setConfirmingDelete(false))
							}
						>
							Yes, delete it
						</Button>
						<Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
							Keep it
						</Button>
					</div>
				) : (
					<div>
						<Button variant="outline" onClick={() => setConfirmingDelete(true)}>
							Delete statement
						</Button>
					</div>
				)}
				<Link to="/statements" className="text-sm underline">
					Back to statements
				</Link>
			</div>
		</section>
	);
}
