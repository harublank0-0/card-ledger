import {
	cloneElement,
	isValidElement,
	type ReactElement,
	type ReactNode,
} from "react";

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

/**
 * A label, one control, an optional hint, and validation messages. The control is pointed at
 * the messages (`aria-describedby`) and marked invalid, so a screen reader announces why a
 * field is wrong when it is focused, not only when the alert first appears.
 */
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
	const hintId = `${htmlFor}-hint`;
	const errorIds = messages.map(
		(_, index) => `${htmlFor}-error${index === 0 ? "" : `-${index}`}`,
	);
	const showHint = Boolean(hint) && messages.length === 0;
	const describedBy = [...(showHint ? [hintId] : []), ...errorIds];

	const control = isValidElement(children)
		? cloneElement(children as ReactElement<Record<string, unknown>>, {
				...(describedBy.length > 0
					? {
							"aria-describedby": [
								(children.props as Record<string, unknown>)["aria-describedby"],
								...describedBy,
							]
								.filter(Boolean)
								.join(" "),
						}
					: {}),
				...(messages.length > 0 ? { "aria-invalid": true } : {}),
			})
		: children;

	return (
		<div className="grid gap-1.5">
			<Label htmlFor={htmlFor}>{label}</Label>
			{control}
			{showHint && (
				<p id={hintId} className="text-xs text-muted-foreground">
					{hint}
				</p>
			)}
			{messages.map((message, index) => (
				<p
					key={message}
					id={errorIds[index]}
					role="alert"
					className="text-xs text-destructive"
				>
					{message}
				</p>
			))}
		</div>
	);
}
