import { useForm } from "@tanstack/react-form";
import {
	createFileRoute,
	Link,
	redirect,
	useRouter,
} from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";

import { FormField } from "#/components/form-field";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { authClient } from "#/lib/auth-client";
import { safeRedirect } from "#/lib/redirect";
import { getSessionFn, getSignupAllowedFn } from "#/lib/session.functions";

export const Route = createFileRoute("/sign-in")({
	validateSearch: z.object({
		redirect: z.string().optional(),
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
	const router = useRouter();
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
			await router.invalidate();
			await router.navigate({ to: safeRedirect(search.redirect) });
		},
	});

	return (
		<main className="mx-auto grid min-h-screen max-w-sm content-center gap-6 p-6">
			<div>
				<h1 className="text-2xl font-semibold">Card Ledger</h1>
				<p className="text-sm text-muted-foreground">Sign in to your ledger.</p>
			</div>
			{search.deleted && (
				<output className="rounded-md bg-secondary p-3 text-sm">
					Your account and all of its data were deleted.
				</output>
			)}
			<form
				className="grid gap-4 rounded-xl border bg-card p-5 shadow-sm"
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
				{error && (
					<p role="alert" className="text-sm text-destructive">
						{error}
					</p>
				)}
				<form.Subscribe selector={(s) => s.isSubmitting}>
					{(isSubmitting) => (
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting ? "Signing in…" : "Sign in"}
						</Button>
					)}
				</form.Subscribe>
			</form>
			{signupAllowed && (
				<p className="text-center text-sm text-muted-foreground">
					First time here?{" "}
					<Link to="/sign-up" className="font-medium text-foreground underline">
						Create the owner account
					</Link>
				</p>
			)}
		</main>
	);
}
