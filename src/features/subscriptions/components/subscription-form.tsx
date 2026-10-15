import { useForm } from "@tanstack/react-form";
import { useState } from "react";

import { ActionError } from "#/components/feedback";
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
import { Switch } from "#/components/ui/switch";
import { Textarea } from "#/components/ui/textarea";
import { CURRENCY_CODES } from "#/lib/money";

import {
	type SubscriptionFormValues,
	subscriptionInputSchema,
} from "../subscriptions.schemas";

export type CardOption = { id: string; name: string; last4: string };

export const emptySubscriptionValues: SubscriptionFormValues = {
	name: "",
	amount: "",
	currency: "NPR",
	intervalCount: "1",
	intervalUnit: "MONTH",
	anchorDate: "",
	paymentMethodId: "",
	autoRenew: true,
	expiresOn: "",
	cancellationDeadline: "",
	notes: "",
};

const PRESETS = [
	{ key: "WEEK:1", label: "Weekly", count: "1", unit: "WEEK" },
	{ key: "MONTH:1", label: "Monthly", count: "1", unit: "MONTH" },
	{ key: "MONTH:3", label: "Quarterly", count: "3", unit: "MONTH" },
	{ key: "YEAR:1", label: "Yearly", count: "1", unit: "YEAR" },
] as const;

const NO_CARD = "none";

export function SubscriptionForm({
	initialValues = emptySubscriptionValues,
	cards,
	submitLabel,
	onSubmit,
	onCancel,
}: {
	initialValues?: SubscriptionFormValues;
	cards: CardOption[];
	submitLabel: string;
	onSubmit: (values: SubscriptionFormValues) => Promise<void>;
	onCancel: () => void;
}) {
	const [error, setError] = useState<string | null>(null);
	const [custom, setCustom] = useState(
		!PRESETS.some(
			(p) =>
				p.count === initialValues.intervalCount &&
				p.unit === initialValues.intervalUnit,
		),
	);

	const form = useForm({
		defaultValues: initialValues,
		validators: { onSubmit: subscriptionInputSchema },
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
			<form.Field name="name">
				{(field) => (
					<FormField
						label="Name"
						htmlFor="name"
						errors={field.state.meta.errors}
						hint="For example: Netflix"
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
				<form.Field name="amount">
					{(field) => (
						<FormField
							label="Amount per billing cycle"
							htmlFor="amount"
							errors={field.state.meta.errors}
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
								onValueChange={(v) =>
									field.handleChange(v as SubscriptionFormValues["currency"])
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

			<form.Subscribe
				selector={(s) =>
					[s.values.intervalCount, s.values.intervalUnit] as const
				}
			>
				{([count, unit]) => (
					<div className="grid gap-4">
						<div className="grid gap-1.5">
							<label
								htmlFor="cycle"
								className="text-sm font-medium leading-none"
							>
								Billing cycle
							</label>
							<Select
								value={custom ? "CUSTOM" : `${unit}:${count}`}
								onValueChange={(key) => {
									if (key === "CUSTOM") {
										setCustom(true);
										return;
									}
									const preset = PRESETS.find((p) => p.key === key);
									if (!preset) return;
									setCustom(false);
									form.setFieldValue("intervalCount", preset.count);
									form.setFieldValue("intervalUnit", preset.unit);
								}}
							>
								<SelectTrigger id="cycle" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{PRESETS.map((p) => (
										<SelectItem key={p.key} value={p.key}>
											{p.label}
										</SelectItem>
									))}
									<SelectItem value="CUSTOM">Custom…</SelectItem>
								</SelectContent>
							</Select>
						</div>
						{custom && (
							<div className="grid gap-5 sm:grid-cols-2">
								<form.Field name="intervalCount">
									{(field) => (
										<FormField
											label="Every"
											htmlFor="intervalCount"
											errors={field.state.meta.errors}
										>
											<Input
												id="intervalCount"
												inputMode="numeric"
												value={field.state.value}
												onChange={(e) => field.handleChange(e.target.value)}
												onBlur={field.handleBlur}
											/>
										</FormField>
									)}
								</form.Field>
								<form.Field name="intervalUnit">
									{(field) => (
										<FormField
											label="Unit"
											htmlFor="intervalUnit"
											errors={field.state.meta.errors}
										>
											<Select
												value={field.state.value}
												onValueChange={(v) =>
													field.handleChange(
														v as SubscriptionFormValues["intervalUnit"],
													)
												}
											>
												<SelectTrigger id="intervalUnit" className="w-full">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="WEEK">Week(s)</SelectItem>
													<SelectItem value="MONTH">Month(s)</SelectItem>
													<SelectItem value="YEAR">Year(s)</SelectItem>
												</SelectContent>
											</Select>
										</FormField>
									)}
								</form.Field>
							</div>
						)}
					</div>
				)}
			</form.Subscribe>

			<form.Field name="anchorDate">
				{(field) => (
					<FormField
						label="Billing date"
						htmlFor="anchorDate"
						errors={field.state.meta.errors}
						hint="Any date you are (or were) billed. Later renewals follow from it, including month-ends."
					>
						<Input
							id="anchorDate"
							type="date"
							value={field.state.value}
							onChange={(e) => field.handleChange(e.target.value)}
							onBlur={field.handleBlur}
						/>
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
							value={field.state.value === "" ? NO_CARD : field.state.value}
							onValueChange={(v) => field.handleChange(v === NO_CARD ? "" : v)}
						>
							<SelectTrigger id="paymentMethodId" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={NO_CARD}>No card selected</SelectItem>
								{cards.map((card) => (
									<SelectItem key={card.id} value={card.id}>
										{card.name} •••• {card.last4}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</FormField>
				)}
			</form.Field>

			<form.Field name="autoRenew">
				{(field) => (
					<div className="flex items-center justify-between gap-4 rounded-md border p-3">
						<div>
							<label htmlFor="autoRenew" className="text-sm font-medium">
								Auto-renews
							</label>
							<p className="text-xs text-muted-foreground">
								Turn off if it ends after the current period.
							</p>
						</div>
						<Switch
							id="autoRenew"
							checked={field.state.value}
							onCheckedChange={field.handleChange}
						/>
					</div>
				)}
			</form.Field>

			<div className="grid gap-5 sm:grid-cols-2">
				<form.Field name="expiresOn">
					{(field) => (
						<FormField
							label="Expires on (optional)"
							htmlFor="expiresOn"
							errors={field.state.meta.errors}
						>
							<Input
								id="expiresOn"
								type="date"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								onBlur={field.handleBlur}
							/>
						</FormField>
					)}
				</form.Field>
				<form.Field name="cancellationDeadline">
					{(field) => (
						<FormField
							label="Cancel by (optional)"
							htmlFor="cancellationDeadline"
							errors={field.state.meta.errors}
						>
							<Input
								id="cancellationDeadline"
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

			<ActionError error={error} />
		</FormPanel>
	);
}
