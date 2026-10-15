import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CircleCheck } from "lucide-react";
import { useState } from "react";

import { ActionError, InlineAlert } from "#/components/feedback";
import { FormField } from "#/components/form-field";
import { SubmitButton } from "#/components/form-layout";
import { PageHeader } from "#/components/page-header";
import { PanelFooter } from "#/components/panel";
import { SettingsSection } from "#/components/settings-section";
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
import { pageTitle } from "#/lib/page-title";
import { useAction } from "#/lib/use-action";

export const Route = createFileRoute("/_authed/settings")({
	head: pageTitle("Settings"),
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
	const save = useServerFn(updateNotificationPreferencesFn);
	const [status, setStatus] = useState<"idle" | "saved">("idle");
	const { run, error } = useAction();
	const zones =
		typeof Intl.supportedValuesOf === "function"
			? Intl.supportedValuesOf("timeZone")
			: [];

	const form = useForm({
		defaultValues: prefs,
		validators: { onSubmit: notificationPreferencesSchema },
		onSubmit: async ({ value }) => {
			setStatus("idle");
			const outcome = await run(() => save({ data: value }));
			if (outcome === "done") setStatus("saved");
		},
	});

	return (
		<div className="max-w-5xl">
			<PageHeader
				title="Settings"
				description="Reminders, your data and your account."
			/>
			<div className="grid gap-8">
				<SettingsSection
					id="reminders-title"
					title="Email reminders"
					description="What to be reminded about, and how many days ahead."
				>
					<form
						className="overflow-hidden rounded-xl border bg-card shadow-panel"
						onSubmit={(e) => {
							e.preventDefault();
							void form.handleSubmit();
						}}
					>
						<div className="grid gap-6 px-4 py-5 sm:px-6">
							<InlineAlert tone={mail === "disabled" ? "warning" : "info"}>
								{MAIL_NOTICE[mail]}
							</InlineAlert>

							<form.Field name="emailEnabled">
								{(field) => (
									<div className="flex items-center justify-between gap-4">
										<label
											htmlFor="emailEnabled"
											className="text-sm font-medium"
										>
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
											className="sm:max-w-sm"
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
										<legend className="mb-2 text-sm font-medium">
											Remind me
										</legend>
										<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
											{[...ALLOWED_OFFSETS]
												.sort((a, b) => b - a)
												.map((days) => (
													<label
														key={days}
														className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-[color,background-color,border-color,text-decoration-color] hover:bg-background has-[:checked]:border-primary/45 has-[:checked]:bg-primary-soft/50 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring"
													>
														<input
															type="checkbox"
															className="size-4 accent-primary"
															checked={field.state.value.includes(days)}
															onChange={(e) =>
																field.handleChange(
																	e.target.checked
																		? [...field.state.value, days]
																		: field.state.value.filter(
																				(d) => d !== days,
																			),
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

							<fieldset className="grid gap-2">
								<legend className="mb-2 text-sm font-medium">
									What to remind me about
								</legend>
								<div className="divide-y rounded-lg border">
									{KINDS.map((kind) => (
										<form.Field key={kind.field} name={kind.field}>
											{(field) => (
												<div className="flex items-center justify-between gap-4 px-3 py-2.5">
													<div>
														<label
															htmlFor={kind.field}
															className="text-sm font-medium"
														>
															{kind.label}
														</label>
														<p className="text-xs text-muted-foreground">
															{kind.hint}
														</p>
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
							</fieldset>

							<ActionError error={error} />
						</div>

						<PanelFooter className="justify-between">
							<span>
								{status === "saved" && (
									<output className="flex items-center gap-1.5 text-sm font-medium text-success">
										<CircleCheck aria-hidden="true" className="size-4" />
										Settings saved.
									</output>
								)}
							</span>
							<form.Subscribe selector={(s) => s.isSubmitting}>
								{(isSubmitting) => (
									<SubmitButton submitting={isSubmitting}>
										Save settings
									</SubmitButton>
								)}
							</form.Subscribe>
						</PanelFooter>
					</form>
				</SettingsSection>

				<YourData />
				<DeleteAccount summary={summary} />
			</div>
		</div>
	);
}
