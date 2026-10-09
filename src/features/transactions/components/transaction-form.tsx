import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { FormField } from "#/components/form-field";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Textarea } from "#/components/ui/textarea";
import { CURRENCY_CODES } from "#/lib/money";

import {
	type TransactionFormValues,
	transactionInputSchema,
} from "../transactions.schemas";

export type CardOption = {
	id: string;
	name: string;
	last4: string;
	currency: string;
};
export type NamedOption = { id: string; name: string };

const NONE = "none";

export function TransactionForm({
	initialValues,
	cards,
	categories,
	subscriptions,
	isRefund,
	autoCurrencyFromCard,
	amountHint,
	submitLabel,
	onSubmit,
	onCancel,
}: {
	initialValues: TransactionFormValues;
	cards: CardOption[];
	categories: NamedOption[];
	subscriptions: NamedOption[];
	/** Refunds keep the expense's currency and cannot be linked to a subscription. */
	isRefund: boolean;
	/** New expenses follow the chosen card's currency until edited. */
	autoCurrencyFromCard: boolean;
	amountHint?: string;
	submitLabel: string;
	onSubmit: (values: TransactionFormValues) => Promise<void>;
	onCancel: () => void;
}) {
	const [error, setError] = useState<string | null>(null);
	const form = useForm({
		defaultValues: initialValues,
		validators: { onSubmit: transactionInputSchema },
		onSubmit: async ({ value }) => {
			setError(null);
			try {
				await onSubmit(value);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Something went wrong");
			}
		},
	});

	return (
		<form
			className="grid max-w-xl gap-4 rounded-xl border bg-card p-5 shadow-sm"
			onSubmit={(e) => {
				e.preventDefault();
				void form.handleSubmit();
			}}
		>
			{!isRefund && (
				<p className="rounded-md bg-secondary p-3 text-sm text-muted-foreground">
					Record things you bought. Paying your credit card bill is not an
					expense; record it as a payment on the card's{" "}
					<Link to="/statements" className="font-medium underline">
						statement
					</Link>
					.
				</p>
			)}

			<form.Field name="description">
				{(field) => (
					<FormField
						label="Description"
						htmlFor="description"
						errors={field.state.meta.errors}
					>
						<Input
							id="description"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							onBlur={field.handleBlur}
						/>
					</FormField>
				)}
			</form.Field>

			<div className="grid gap-4 sm:grid-cols-2">
				<form.Field name="amount">
					{(field) => (
						<FormField
							label="Amount"
							htmlFor="amount"
							errors={field.state.meta.errors}
							hint={amountHint}
						>
							<Input
								id="amount"
								inputMode="decimal"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								onBlur={field.handleBlur}
							/>
						</FormField>
					)}
				</form.Field>
				<form.Field name="currency">
					{(field) => (
						<FormField
							label="Currency"
							htmlFor="currency"
							errors={field.state.meta.errors}
						>
							<Select
								value={field.state.value}
								disabled={isRefund}
								onValueChange={(v) =>
									field.handleChange(v as TransactionFormValues["currency"])
								}
							>
								<SelectTrigger id="currency" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{CURRENCY_CODES.map((code) => (
										<SelectItem key={code} value={code}>
											{code}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FormField>
					)}
				</form.Field>
			</div>

			<form.Field name="occurredOn">
				{(field) => (
					<FormField
						label="Date"
						htmlFor="occurredOn"
						errors={field.state.meta.errors}
					>
						<Input
							id="occurredOn"
							type="date"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							onBlur={field.handleBlur}
						/>
					</FormField>
				)}
			</form.Field>

			<div className="grid gap-4 sm:grid-cols-2">
				<form.Field name="categoryId">
					{(field) => (
						<FormField
							label="Category"
							htmlFor="categoryId"
							errors={field.state.meta.errors}
						>
							<Select
								value={field.state.value === "" ? NONE : field.state.value}
								onValueChange={(v) => field.handleChange(v === NONE ? "" : v)}
							>
								<SelectTrigger id="categoryId" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NONE}>Uncategorized</SelectItem>
									{categories.map((c) => (
										<SelectItem key={c.id} value={c.id}>
											{c.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FormField>
					)}
				</form.Field>
				<form.Field name="paymentMethodId">
					{(field) => (
						<FormField
							label="Paid with"
							htmlFor="paymentMethodId"
							errors={field.state.meta.errors}
						>
							<Select
								value={field.state.value === "" ? NONE : field.state.value}
								onValueChange={(v) => {
									field.handleChange(v === NONE ? "" : v);
									const card = cards.find((c) => c.id === v);
									if (autoCurrencyFromCard && card) {
										form.setFieldValue(
											"currency",
											card.currency as TransactionFormValues["currency"],
										);
									}
								}}
							>
								<SelectTrigger id="paymentMethodId" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NONE}>No card (cash, other)</SelectItem>
									{cards.map((c) => (
										<SelectItem key={c.id} value={c.id}>
											{c.name} •••• {c.last4}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FormField>
					)}
				</form.Field>
			</div>

			{!isRefund && (
				<form.Field name="subscriptionId">
					{(field) => (
						<FormField
							label="Subscription charge (optional)"
							htmlFor="subscriptionId"
							errors={field.state.meta.errors}
							hint="Link this to a subscription you track. It does not change the subscription."
						>
							<Select
								value={field.state.value === "" ? NONE : field.state.value}
								onValueChange={(v) => field.handleChange(v === NONE ? "" : v)}
							>
								<SelectTrigger id="subscriptionId" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={NONE}>Not a subscription</SelectItem>
									{subscriptions.map((s) => (
										<SelectItem key={s.id} value={s.id}>
											{s.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</FormField>
					)}
				</form.Field>
			)}

			<form.Field name="notes">
				{(field) => (
					<FormField
						label="Notes (optional)"
						htmlFor="notes"
						errors={field.state.meta.errors}
					>
						<Textarea
							id="notes"
							rows={3}
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							onBlur={field.handleBlur}
						/>
					</FormField>
				)}
			</form.Field>

			{error && (
				<p role="alert" className="text-sm text-destructive">
					{error}
				</p>
			)}

			<div className="flex gap-2">
				<form.Subscribe selector={(s) => s.isSubmitting}>
					{(isSubmitting) => (
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Saving…" : submitLabel}
						</Button>
					)}
				</form.Subscribe>
				<Button type="button" variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
			</div>
		</form>
	);
}
