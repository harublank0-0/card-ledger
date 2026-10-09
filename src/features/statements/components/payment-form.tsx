import { useForm } from "@tanstack/react-form";
import { useState } from "react";

import { FormField } from "#/components/form-field";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";

import {
	type PaymentFormValues,
	paymentInputSchema,
} from "../statements.schemas";

/** Record a payment toward a statement. A payment is not an expense and is never counted as spending. */
export function PaymentForm({
	initialValues,
	onSubmit,
}: {
	initialValues: PaymentFormValues;
	onSubmit: (values: PaymentFormValues) => Promise<void>;
}) {
	const [error, setError] = useState<string | null>(null);
	const form = useForm({
		defaultValues: initialValues,
		validators: { onSubmit: paymentInputSchema },
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
			className="grid gap-3"
			onSubmit={(e) => {
				e.preventDefault();
				void form.handleSubmit();
			}}
		>
			<div className="grid gap-3 sm:grid-cols-2">
				<form.Field name="amount">
					{(field) => (
						<FormField
							label={`Amount (${initialValues.currency})`}
							htmlFor="payAmount"
							errors={field.state.meta.errors}
						>
							<Input
								id="payAmount"
								inputMode="decimal"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								onBlur={field.handleBlur}
							/>
						</FormField>
					)}
				</form.Field>
				<form.Field name="paidOn">
					{(field) => (
						<FormField
							label="Paid on"
							htmlFor="payDate"
							errors={field.state.meta.errors}
						>
							<Input
								id="payDate"
								type="date"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								onBlur={field.handleBlur}
							/>
						</FormField>
					)}
				</form.Field>
			</div>
			<form.Field name="notes">
				{(field) => (
					<FormField
						label="Notes (optional)"
						htmlFor="payNotes"
						errors={field.state.meta.errors}
					>
						<Input
							id="payNotes"
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
			<div>
				<form.Subscribe selector={(s) => s.isSubmitting}>
					{(isSubmitting) => (
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Saving…" : "Record payment"}
						</Button>
					)}
				</form.Subscribe>
			</div>
		</form>
	);
}
