import { useForm } from "@tanstack/react-form";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { FormField } from "#/components/form-field";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Switch } from "#/components/ui/switch";
import { getAccountSummaryFn } from "#/features/account/account.functions";
import { DeleteAccount } from "#/features/account/components/delete-account";
import { YourData } from "#/features/account/components/your-data";
import {
	getNotificationPreferencesFn,
	updateNotificationPreferencesFn,
} from "#/features/notifications/notifications.functions";
import { ALLOWED_OFFSETS } from "#/features/notifications/notifications.logic";
import { notificationPreferencesSchema } from "#/features/notifications/notifications.schemas";

export const Route = createFileRoute("/_authed/settings")({
	loader: async () => {
		const [preferences, summary] = await Promise.all([
			getNotificationPreferencesFn(),
			getAccountSummaryFn(),
		]);
		return { preferences, summary };
	},
	component: Settings,
});

const MAIL_NOTICE = {
	smtp: "Email is sent through the SMTP server configured on this instance.",
	console:
		"Development mode: no SMTP server is configured, so reminders are only logged on the server and not emailed.",
	disabled:
		"Email is not configured on this server (SMTP_HOST is not set), so reminders are paused. Ask the administrator to configure SMTP.",
} as const;

const KINDS = [
	{
		field: "renewalEnabled",
		label: "Subscription renewals",
		hint: "The day a subscription is expected to renew.",
	},
	{
		field: "expiryEnabled",
		label: "Subscription expiry",
		hint: "When a subscription's expiry date is near.",
	},
	{
		field: "cancellationEnabled",
		label: "Cancellation deadlines",
		hint: "Your “cancel by” dates.",
	},
	{
		field: "paymentDueEnabled",
		label: "Card payment due days",
		hint: "Based on the payment due day saved on each card.",
	},
] as const;

const offsetLabel = (days: number) =>
	days === 0
		? "On the day"
		: days === 1
			? "1 day before"
			: `${days} days before`;

function Settings() {
	const { preferences, summary } = Route.useLoaderData();
	const { mail, ...prefs } = preferences;
	const router = useRouter();
	const save = useServerFn(updateNotificationPreferencesFn);
	const [status, setStatus] = useState<"idle" | "saved">("idle");
	const [error, setError] = useState<string | null>(null);
	const zones =
		typeof Intl.supportedValuesOf === "function"
			? Intl.supportedValuesOf("timeZone")
			: [];

	const form = useForm({
		defaultValues: prefs,
		validators: { onSubmit: notificationPreferencesSchema },
		onSubmit: async ({ value }) => {
			setError(null);
			setStatus("idle");
			try {
				await save({ data: value });
				await router.invalidate();
				setStatus("saved");
			} catch (e) {
				setError(e instanceof Error ? e.message : "Something went wrong");
			}
		},
	});

	return (
		<section className="grid max-w-xl gap-4">
			<h1 className="text-2xl font-semibold">Settings</h1>
			<p
				className={`rounded-md p-3 text-sm ${mail === "disabled" ? "bg-destructive/10 text-destructive" : "bg-secondary text-muted-foreground"}`}
			>
				{MAIL_NOTICE[mail]}
			</p>

			<form
				className="grid gap-5 rounded-xl border bg-card p-5 shadow-sm"
				onSubmit={(e) => {
					e.preventDefault();
					void form.handleSubmit();
				}}
			>
				<h2 className="text-lg font-medium">Email reminders</h2>

				<form.Field name="emailEnabled">
					{(field) => (
						<div className="flex items-center justify-between gap-4 rounded-md border p-3">
							<label htmlFor="emailEnabled" className="text-sm font-medium">
								Send me reminder emails
							</label>
							<Switch
								id="emailEnabled"
								checked={field.state.value}
								onCheckedChange={field.handleChange}
							/>
						</div>
					)}
				</form.Field>

				<form.Field name="timezone">
					{(field) => (
						<FormField
							label="Time zone"
							htmlFor="timezone"
							errors={field.state.meta.errors}
							hint="Decides what “today” means for reminders and renewal countdowns."
						>
							<Input
								id="timezone"
								list="timezones"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								onBlur={field.handleBlur}
							/>
							<datalist id="timezones">
								{zones.map((zone) => (
									<option key={zone} value={zone} />
								))}
							</datalist>
						</FormField>
					)}
				</form.Field>

				<form.Field name="offsetsDays">
					{(field) => (
						<fieldset className="grid gap-2">
							<legend className="mb-1 text-sm font-medium">Remind me</legend>
							<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
								{[...ALLOWED_OFFSETS]
									.sort((a, b) => b - a)
									.map((days) => (
										<label
											key={days}
											className="flex items-center gap-2 text-sm"
										>
											<input
												type="checkbox"
												className="size-4"
												checked={field.state.value.includes(days)}
												onChange={(e) =>
													field.handleChange(
														e.target.checked
															? [...field.state.value, days]
															: field.state.value.filter((d) => d !== days),
													)
												}
											/>
											{offsetLabel(days)}
										</label>
									))}
							</div>
							{field.state.meta.errors.length > 0 && (
								<p role="alert" className="text-xs text-destructive">
									Unsupported reminder day
								</p>
							)}
						</fieldset>
					)}
				</form.Field>

				<div className="grid gap-2">
					<p className="text-sm font-medium">What to remind me about</p>
					{KINDS.map((kind) => (
						<form.Field key={kind.field} name={kind.field}>
							{(field) => (
								<div className="flex items-center justify-between gap-4 rounded-md border p-3">
									<div>
										<label htmlFor={kind.field} className="text-sm font-medium">
											{kind.label}
										</label>
										<p className="text-xs text-muted-foreground">{kind.hint}</p>
									</div>
									<Switch
										id={kind.field}
										checked={field.state.value}
										onCheckedChange={field.handleChange}
									/>
								</div>
							)}
						</form.Field>
					))}
				</div>

				{error && (
					<p role="alert" className="text-sm text-destructive">
						{error}
					</p>
				)}
				{status === "saved" && (
					<output className="text-sm text-muted-foreground">
						Settings saved.
					</output>
				)}

				<div>
					<form.Subscribe selector={(s) => s.isSubmitting}>
						{(isSubmitting) => (
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting ? "Saving…" : "Save settings"}
							</Button>
						)}
					</form.Subscribe>
				</div>
			</form>

			<YourData />
			<DeleteAccount summary={summary} />
		</section>
	);
}
