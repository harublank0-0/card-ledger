import type { ReactNode } from "react";

import { Label } from "#/components/ui/label";

/** TanStack Form + Standard Schema errors are `{ message }` objects or strings. */
export function errorMessages(errors: ReadonlyArray<unknown>) {
	return errors
		.map((e) =>
			typeof e === "string"
				? e
				: e && typeof e === "object" && "message" in e
					? String((e as { message: unknown }).message)
					: "",
		)
		.filter(Boolean);
}

export function FormField({
	label,
	htmlFor,
	errors,
	hint,
	children,
}: {
	label: string;
	htmlFor: string;
	errors: ReadonlyArray<unknown>;
	hint?: string;
	children: ReactNode;
}) {
	const messages = errorMessages(errors);
	return (
		<div className="grid gap-1.5">
			<Label htmlFor={htmlFor}>{label}</Label>
			{children}
			{hint && messages.length === 0 && (
				<p className="text-xs text-muted-foreground">{hint}</p>
			)}
			{messages.map((message) => (
				<p key={message} role="alert" className="text-xs text-destructive">
					{message}
				</p>
			))}
		</div>
	);
}
