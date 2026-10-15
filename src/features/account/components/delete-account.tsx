import { useState } from "react";

import { ActionError } from "#/components/feedback";
import { FormField } from "#/components/form-field";
import { SubmitButton } from "#/components/form-layout";
import { SettingsSection } from "#/components/settings-section";
import { Input } from "#/components/ui/input";
import { authClient } from "#/lib/auth-client";
import { reloadTo } from "#/lib/session-change";

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
	const [password, setPassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const ready = password.length > 0 && confirmation === DELETE_CONFIRMATION;

	return (
		<SettingsSection
			id="delete-title"
			title="Delete account"
			description={
				<>
					This permanently deletes your account and everything in it:{" "}
					<span className="font-medium text-foreground">
						{describeAccountContents(summary)}
					</span>
					. It cannot be undone.
				</>
			}
		>
			<form
				className="overflow-hidden rounded-xl border border-destructive-line bg-card shadow-panel"
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
					reloadTo("/sign-in?deleted=true");
				}}
			>
				<div className="grid gap-4 px-4 py-4 sm:px-5">
					<p className="text-sm">
						<a
							href="/api/export/json"
							download
							className="font-medium underline decoration-border-strong underline-offset-4 hover:decoration-foreground"
						>
							Download your data first
						</a>
					</p>
					<div className="grid gap-4 sm:grid-cols-2">
						<FormField
							label="Your password"
							htmlFor="deletePassword"
							errors={[]}
						>
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
					</div>
					<ActionError error={error} />
				</div>
				<div className="flex justify-end border-t border-destructive-line/70 bg-destructive-soft/50 px-4 py-3 sm:px-5">
					<SubmitButton
						variant="destructive"
						submitting={busy}
						disabled={!ready}
						pendingLabel="Deleting…"
					>
						Delete my account and data
					</SubmitButton>
				</div>
			</form>
		</SettingsSection>
	);
}
