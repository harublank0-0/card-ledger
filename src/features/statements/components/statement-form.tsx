import { useForm } from "@tanstack/react-form";
import { useState } from "react";

import { FormField } from "#/components/form-field";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";

import {
	type StatementFormValues,
	statementInputSchema,
} from "../statements.schemas";

/**
 * Statement amounts and dates come from the bank's statement, not from your own
 * transactions. The card and currency are fixed: a statement is in the card's currency.
 */
export function StatementForm({
	initialValues,
	cardLabel,
	submitLabel,
	onSubmit,
	onCancel,
}: {
	initialValues: StatementFormValues;
	cardLabel: string;
	submitLabel: string;
	onSubmit: (values: StatementFormValues) => Promise<void>;
	onCancel: () => void;
}) {
	const [error, setError] = useState<string | null>(null);
	const form = useForm({
		defaultValues: initialValues,
		validators: { onSubmit: statementInputSchema },
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
			<p className="rounded-md bg-secondary p-3 text-sm text-muted-foreground">
				Enter the figures printed on your bank statement for{" "}
				<span className="font-medium text-foreground">{cardLabel}</span> (
				{initialValues.currency}). They are not calculated from your own
				transactions.
			</p>

			<div className="grid gap-4 sm:grid-cols-2">
				<form.Field name="periodStart">
					{(field) => (
						<FormField
							label="Period start"
							htmlFor="periodStart"
							errors={field.state.meta.errors}
						>
							<Input
								id="periodStart"
								type="date"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								onBlur={field.handleBlur}
							/>
						</FormField>
					)}
				</form.Field>
				<form.Field name="periodEnd">
					{(field) => (
						<FormField
							label="Period end (statement date)"
							htmlFor="periodEnd"
							errors={field.state.meta.errors}
						>
							<Input
								id="periodEnd"
								type="date"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								onBlur={field.handleBlur}
							/>
						</FormField>
					)}
				</form.Field>
			</div>

			<form.Field name="dueDate">
				{(field) => (
					<FormField
						label="Payment due date"
						htmlFor="dueDate"
						errors={field.state.meta.errors}
					>
						<Input
							id="dueDate"
							type="date"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							onBlur={field.handleBlur}
						/>
					</FormField>
				)}
			</form.Field>

			<div className="grid gap-4 sm:grid-cols-2">
				<form.Field name="balance">
					{(field) => (
						<FormField
							label={`Statement balance (${initialValues.currency})`}
							htmlFor="balance"
							errors={field.state.meta.errors}
						>
							<Input
								id="balance"
								inputMode="decimal"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								onBlur={field.handleBlur}
							/>
						</FormField>
					)}
				</form.Field>
				<form.Field name="minimumDue">
					{(field) => (
						<FormField
							label="Minimum due (optional)"
							htmlFor="minimumDue"
							errors={field.state.meta.errors}
						>
							<Input
								id="minimumDue"
								inputMode="decimal"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								onBlur={field.handleBlur}
							/>
						</FormField>
					)}
				</form.Field>
			</div>

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
