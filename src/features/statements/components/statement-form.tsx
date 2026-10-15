import { useForm } from "@tanstack/react-form";
import { useState } from "react";

import { ActionError, InlineAlert } from "#/components/feedback";
import { FormField } from "#/components/form-field";
import { FormPanel, SubmitButton } from "#/components/form-layout";
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
		<FormPanel
			onSubmit={(e) => {
				e.preventDefault();
				void form.handleSubmit();
			}}
			actions={
				<>
					<Button type="button" variant="ghost" onClick={onCancel}>
						Cancel
					</Button>
					<form.Subscribe selector={(s) => s.isSubmitting}>
						{(isSubmitting) => (
							<SubmitButton submitting={isSubmitting}>
								{submitLabel}
							</SubmitButton>
						)}
					</form.Subscribe>
				</>
			}
		>
			<InlineAlert tone="info">
				Enter the figures printed on your bank statement for{" "}
				<span className="font-medium text-foreground">{cardLabel}</span> (
				{initialValues.currency}). They are not calculated from your own
				transactions.
			</InlineAlert>

			<div className="grid gap-5 sm:grid-cols-2">
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

			<div className="grid gap-5 sm:grid-cols-2">
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

			<ActionError error={error} />
		</FormPanel>
	);
}
