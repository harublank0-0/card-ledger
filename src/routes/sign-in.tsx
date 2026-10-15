import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { BrandMark } from "#/components/brand";
import { ActionError, InlineAlert } from "#/components/feedback";
import { FormField } from "#/components/form-field";
import { SubmitButton } from "#/components/form-layout";
import { Input } from "#/components/ui/input";
import { authClient } from "#/lib/auth-client";
import { pageTitle } from "#/lib/page-title";
import { safeRedirect } from "#/lib/redirect";
import { getSessionFn, getSignupAllowedFn } from "#/lib/session.functions";
import { reloadTo } from "#/lib/session-change";

export const Route = createFileRoute("/sign-in")({
	head: pageTitle("Sign in"),
	validateSearch: z.object({
		redirect: z.string().optional().catch(undefined),
		deleted: z.boolean().optional().catch(undefined),
	}),
	beforeLoad: async ({ search }) => {
		if (await getSessionFn())
			throw redirect({ to: safeRedirect(search.redirect) });
	},
	loader: async () => ({ signupAllowed: await getSignupAllowedFn() }),
	component: SignIn,
});

function SignIn() {
	const search = Route.useSearch();
	const { signupAllowed } = Route.useLoaderData();
	const [error, setError] = useState<string | null>(null);

	const form = useForm({
		defaultValues: { email: "", password: "" },
		validators: {
			onSubmit: z.object({
				email: z.email("Enter a valid email"),
				password: z.string().min(1, "Password is required"),
			}),
		},
		onSubmit: async ({ value }) => {
			setError(null);
			const result = await authClient.signIn.email(value);
			if (result.error) {
				setError(result.error.message ?? "Could not sign in");
				return;
			}
			reloadTo(safeRedirect(search.redirect));
		},
	});

	return (
		<main className="mx-auto grid min-h-screen w-full max-w-sm content-center gap-6 px-4 py-10">
			<div className="grid justify-items-start gap-4">
				<BrandMark className="size-9" />
				<div>
					<h1 className="text-2xl font-semibold tracking-tight">Card Ledger</h1>
					<p className="text-sm text-muted-foreground">
						Sign in to your ledger.
					</p>
				</div>
			</div>
			{search.deleted && (
				<output>
					<InlineAlert tone="success">
						Your account and all of its data were deleted.
					</InlineAlert>
				</output>
			)}
			<form
				className="grid gap-4 rounded-xl border bg-card p-5 shadow-panel sm:p-6"
				onSubmit={(e) => {
					e.preventDefault();
					void form.handleSubmit();
				}}
			>
				<form.Field name="email">
					{(field) => (
						<FormField
							label="Email"
							htmlFor="email"
							errors={field.state.meta.errors}
						>
							<Input
								id="email"
								type="email"
								autoComplete="email"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								onBlur={field.handleBlur}
							/>
						</FormField>
					)}
				</form.Field>
				<form.Field name="password">
					{(field) => (
						<FormField
							label="Password"
							htmlFor="password"
							errors={field.state.meta.errors}
						>
							<Input
								id="password"
								type="password"
								autoComplete="current-password"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								onBlur={field.handleBlur}
							/>
						</FormField>
					)}
				</form.Field>
				<ActionError error={error} />
				<form.Subscribe selector={(s) => s.isSubmitting}>
					{(isSubmitting) => (
						<SubmitButton
							submitting={isSubmitting}
							pendingLabel="Signing in…"
							className="mt-1 w-full"
						>
							Sign in
						</SubmitButton>
					)}
				</form.Subscribe>
			</form>
			{signupAllowed && (
				<p className="text-center text-sm text-muted-foreground">
					First time here?{" "}
					<Link
						to="/sign-up"
						className="font-medium text-foreground underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
					>
						Create the owner account
					</Link>
				</p>
			)}
		</main>
	);
}
