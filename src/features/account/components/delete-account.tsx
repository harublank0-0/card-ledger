import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { FormField } from "#/components/form-field";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { authClient } from "#/lib/auth-client";

export const DELETE_CONFIRMATION = "DELETE";

export type AccountSummary = {
	cards: number;
	subscriptions: number;
	transactions: number;
	statements: number;
	statementPayments: number;
	categories: number;
};

const plural = (n: number, one: string, many = `${one}s`) =>
	`${n} ${n === 1 ? one : many}`;

/** The sentence listing what an account holds, e.g. "3 transactions, 1 card". Zero counts are left out. */
export function describeAccountContents(summary: AccountSummary) {
	const parts = [
		summary.transactions > 0 && plural(summary.transactions, "transaction"),
		summary.statements > 0 && plural(summary.statements, "statement"),
		summary.statementPayments > 0 &&
			plural(summary.statementPayments, "statement payment"),
		summary.subscriptions > 0 && plural(summary.subscriptions, "subscription"),
		summary.cards > 0 && plural(summary.cards, "card"),
		summary.categories > 0 &&
			plural(summary.categories, "category", "categories"),
	].filter(Boolean);
	return parts.length === 0 ? "no records yet" : parts.join(", ");
}

/**
 * Permanently deletes the account. The password is the real safeguard (the server refuses a
 * request without it); typing DELETE only prevents misclicks.
 */
export function DeleteAccount({ summary }: { summary: AccountSummary }) {
	const router = useRouter();
	const [password, setPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const ready = password.length > 0 && confirmation === DELETE_CONFIRMATION;

	return (
		<section
			aria-labelledby="delete-title"
			className="grid gap-3 rounded-xl border border-destructive/40 bg-card p-5 shadow-sm"
		>
			<div>
				<h2 id="delete-title" className="text-lg font-medium">
					Delete account
				</h2>
				<p className="text-sm text-muted-foreground">
					This permanently deletes your account and everything in it:{" "}
					<span className="font-medium text-foreground">
						{describeAccountContents(summary)}
					</span>
					. It cannot be undone.
				</p>
				<p className="mt-1 text-sm">
					<a href="/api/export/json" download className="underline">
						Download your data first
					</a>
				</p>
			</div>
			<form
				className="grid gap-3"
				onSubmit={async (e) => {
					e.preventDefault();
					if (!ready) return;
					setBusy(true);
					setError(null);
					const result = await authClient.deleteUser({ password });
					if (result.error) {
						setBusy(false);
						setError(result.error.message ?? "Could not delete the account");
						return;
					}
					await router.invalidate();
					await router.navigate({ to: "/sign-in", search: { deleted: true } });
				}}
			>
				<FormField label="Your password" htmlFor="deletePassword" errors={[]}>
					<Input
						id="deletePassword"
						type="password"
						autoComplete="current-password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
					/>
				</FormField>
				<FormField
					label={`Type ${DELETE_CONFIRMATION} to confirm`}
					htmlFor="deleteConfirm"
					errors={[]}
				>
					<Input
						id="deleteConfirm"
						autoComplete="off"
						value={confirmation}
						onChange={(e) => setConfirmation(e.target.value)}
					/>
				</FormField>
				{error && (
					<p role="alert" className="text-sm text-destructive">
						{error}
					</p>
				)}
				<div>
					<Button type="submit" variant="destructive" disabled={!ready || busy}>
						{busy ? "Deleting…" : "Delete my account and data"}
					</Button>
				</div>
			</form>
		</section>
	);
}
