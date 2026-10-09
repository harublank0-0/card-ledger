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
import { getSessionFn, getSignupAllowedFn } from "#/lib/session.functions";

export const Route = createFileRoute("/sign-up")({
	beforeLoad: async () => {
		if (await getSessionFn()) throw redirect({ to: "/" });
	},
	loader: async () => ({ signupAllowed: await getSignupAllowedFn() }),
	component: SignUp,
});

const schema = z.object({
	name: z.string().trim().min(1, "Name is required"),
	email: z.email("Enter a valid email"),
	password: z.string().min(12, "Use at least 12 characters"),
});

function SignUp() {
	const router = useRouter();
	const { signupAllowed } = Route.useLoaderData();
	const [error, setError] = useState<string | null>(null);

	const form = useForm({
		defaultValues: { name: "", email: "", password: "" },
		validators: { onSubmit: schema },
		onSubmit: async ({ value }) => {
			setError(null);
			const result = await authClient.signUp.email(value);
			if (result.error) {
				setError(result.error.message ?? "Could not create the account");
				return;
			}
			await router.invalidate();
			await router.navigate({ to: "/" });
		},
	});

	if (!signupAllowed) {
		return (
			<main className="mx-auto grid min-h-screen max-w-sm content-center gap-4 p-6">
				<h1 className="text-2xl font-semibold">Sign-up is closed</h1>
				<p className="text-sm text-muted-foreground">
					This instance does not accept new accounts.{" "}
					<Link to="/sign-in" className="font-medium text-foreground underline">
						Sign in
					</Link>
				</p>
			</main>
		);
	}

	return (
		<main className="mx-auto grid min-h-screen max-w-sm content-center gap-6 p-6">
			<div>
				<h1 className="text-2xl font-semibold">Create your account</h1>
				<p className="text-sm text-muted-foreground">
					Your data stays on this server. Registration closes after the first
					account.
				</p>
			</div>
			<form
				className="grid gap-4 rounded-xl border bg-card p-5 shadow-sm"
				onSubmit={(e) => {
					e.preventDefault();
					void form.handleSubmit();
				}}
			>
				<form.Field name="name">
					{(field) => (
						<FormField
							label="Name"
							htmlFor="name"
							errors={field.state.meta.errors}
						>
							<Input
								id="name"
								autoComplete="name"
								value={field.state.value}
								onChange={(e) => field.handleChange(e.target.value)}
								onBlur={field.handleBlur}
							/>
						</FormField>
					)}
				</form.Field>
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
							hint="At least 12 characters."
						>
							<Input
								id="password"
								type="password"
								autoComplete="new-password"
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
							{isSubmitting ? "Creating…" : "Create account"}
						</Button>
					)}
				</form.Subscribe>
			</form>
		</main>
	);
}
