import { useForm } from "@tanstack/react-form";
import { useState } from "react";

import { ActionError, InlineAlert } from "#/components/feedback";
import { FormField } from "#/components/form-field";
import { FormPanel, SubmitButton } from "#/components/form-layout";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { CURRENCY_CODES } from "#/lib/money";
import { last4FromPaste } from "../payment-methods.logic";
import {
	type PaymentMethodFormValues,
	paymentMethodInputSchema,
} from "../payment-methods.schemas";

export const emptyCardValues: PaymentMethodFormValues = {
	name: "",
	issuer: "",
	last4: "",
	currency: "NPR",
	creditLimit: "",
	statementDay: "",
	paymentDueDay: "",
};

export function CardForm({
	initialValues = emptyCardValues,
	submitLabel,
	onSubmit,
	onCancel,
}: {
	initialValues?: PaymentMethodFormValues;
	submitLabel: string;
	onSubmit: (values: PaymentMethodFormValues) => Promise<void>;
	onCancel: () => void;
}) {
	const [error, setError] = useState<string | null>(null);
	const form = useForm({
		defaultValues: initialValues,
		validators: { onSubmit: paymentMethodInputSchema },
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
				Card Ledger never stores your full card number, CVV or PIN. Only the
				last four digits are saved so you can recognise the card.
			</InlineAlert>

			<form.Field name="name">
				{(field) => (
					<FormField
						label="Card name"
						htmlFor="name"
						errors={field.state.meta.errors}
						hint="For example: Daily card"
					>
						<Input
							id="name"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							onBlur={field.handleBlur}
						/>
					</FormField>
				)}
			</form.Field>

			<div className="grid gap-5 sm:grid-cols-2">
				<form.Field name="issuer">
					{(field) => (
						<FormField
							label="Bank / issuer (optional)"
							htmlFor="issuer"
							errors={field.state.meta.errors}
						>
							<Input
								id="issuer"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								onBlur={field.handleBlur}
							/>
						</FormField>
					)}
				</form.Field>
				<form.Field name="last4">
					{(field) => (
						<FormField
							label="Last 4 digits"
							htmlFor="last4"
							errors={field.state.meta.errors}
						>
							<Input
								id="last4"
								inputMode="numeric"
								maxLength={4}
								autoComplete="off"
								value={field.state.value}
								onChange={(e) =>
									field.handleChange(e.target.value.replace(/\D/g, ""))
								}
								onPaste={(e) => {
									// Without this the browser keeps the FIRST four characters.
									e.preventDefault();
									field.handleChange(
										last4FromPaste(e.clipboardData.getData("text")),
									);
								}}
								onBlur={field.handleBlur}
							/>
						</FormField>
					)}
				</form.Field>
			</div>

			<div className="grid gap-5 sm:grid-cols-2">
				<form.Field name="currency">
					{(field) => (
						<FormField
							label="Currency"
							htmlFor="currency"
							errors={field.state.meta.errors}
						>
							<Select
								value={field.state.value}
								onValueChange={(v) =>
									field.handleChange(v as PaymentMethodFormValues["currency"])
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
				<form.Field name="creditLimit">
					{(field) => (
						<FormField
							label="Credit limit (optional)"
							htmlFor="creditLimit"
							errors={field.state.meta.errors}
						>
							<Input
								id="creditLimit"
								inputMode="decimal"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								onBlur={field.handleBlur}
							/>
						</FormField>
					)}
				</form.Field>
			</div>

			<div className="grid gap-5 sm:grid-cols-2">
				<form.Field name="statementDay">
					{(field) => (
						<FormField
							label="Statement day (optional)"
							htmlFor="statementDay"
							errors={field.state.meta.errors}
							hint="Day of the month, 1–31"
						>
							<Input
								id="statementDay"
								inputMode="numeric"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								onBlur={field.handleBlur}
							/>
						</FormField>
					)}
				</form.Field>
				<form.Field name="paymentDueDay">
					{(field) => (
						<FormField
							label="Payment due day (optional)"
							htmlFor="paymentDueDay"
							errors={field.state.meta.errors}
							hint="Day of the month, 1–31"
						>
							<Input
								id="paymentDueDay"
								inputMode="numeric"
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
