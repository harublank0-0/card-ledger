import { cn } from "cn";
import { LoaderCircle } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { PanelFooter } from "#/components/panel";
import { Button } from "#/components/ui/button";

/** A form on its own page: fields on a white panel, actions in a bar along the bottom. */
export function FormPanel({
	className,
	children,
	actions,
	...props
}: ComponentProps<"form"> & { actions: ReactNode }) {
	return (
		<form
			className={cn(
				"overflow-hidden rounded-xl border bg-card shadow-panel",
				className,
			)}
			{...props}
		>
			<div className="grid gap-5 p-4 sm:p-6">{children}</div>
			<PanelFooter>{actions}</PanelFooter>
		</form>
	);
}

/** The form's main button. It keeps its place while saving and shows a spinner. */
export function SubmitButton({
	submitting,
	children,
	pendingLabel = "Saving…",
	className,
	variant,
	disabled = false,
}: {
	submitting: boolean;
	/** Not ready to submit yet (in addition to while saving). */
	disabled?: boolean;
	children: ReactNode;
	pendingLabel?: string;
	className?: string;
	variant?: "default" | "destructive";
}) {
	return (
		<Button
			type="submit"
			variant={variant}
			disabled={submitting || disabled}
			className={className}
		>
			{submitting && (
				<LoaderCircle aria-hidden="true" className="animate-spin" />
			)}
			{submitting ? pendingLabel : children}
		</Button>
	);
}
