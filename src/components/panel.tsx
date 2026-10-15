import { cn } from "cn";
import type { ComponentProps, ReactNode } from "react";

/** A white surface on the grey canvas. Used for tables, forms and grouped facts, not for every block. */
export function Panel({ className, ...props }: ComponentProps<"section">) {
	return (
		<section
			className={cn(
				"overflow-hidden rounded-xl border bg-card shadow-panel",
				className,
			)}
			{...props}
		/>
	);
}

export function PanelHeader({
	id,
	title,
	description,
	actions,
	className,
}: {
	id?: string;
	title: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3 sm:px-5",
				className,
			)}
		>
			<div className="min-w-0">
				<h2 id={id} className="text-[15px] font-semibold text-foreground">
					{title}
				</h2>
				{description && (
					<p className="text-xs text-muted-foreground">{description}</p>
				)}
			</div>
			{actions && <div className="flex items-center gap-2">{actions}</div>}
		</div>
	);
}

/** Bottom bar of a form panel: secondary action first, the primary one last (rightmost). */
export function PanelFooter({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"flex flex-wrap items-center justify-end gap-2 border-t bg-background/60 px-4 py-3 sm:px-5",
				className,
			)}
			{...props}
		/>
	);
}

/**
 * A row of figures in one panel, separated by hairlines instead of separate boxes. On phones
 * the figures stack, or sit two by two with `pairs` (use it for an even number of figures).
 */
export function StatGroup({
	className,
	pairs = false,
	...props
}: ComponentProps<"div"> & { pairs?: boolean }) {
	return (
		<div
			className={cn(
				"grid gap-px overflow-hidden rounded-xl border bg-border shadow-panel sm:auto-cols-fr sm:grid-flow-col",
				pairs ? "grid-cols-2 sm:grid-cols-none" : "grid-cols-1",
				className,
			)}
			{...props}
		/>
	);
}

export function Stat({
	label,
	labelId,
	children,
	footer,
	className,
}: {
	label: ReactNode;
	/** When set, the figure is a labelled region (the label becomes its heading). */
	labelId?: string;
	children: ReactNode;
	footer?: ReactNode;
	className?: string;
}) {
	const Root = labelId ? "section" : "div";
	const Label = labelId ? "h2" : "p";
	return (
		<Root
			aria-labelledby={labelId}
			className={cn("min-w-0 bg-card px-4 py-3.5 sm:px-5 sm:py-4", className)}
		>
			<Label id={labelId} className="text-xs font-medium text-muted-foreground">
				{label}
			</Label>
			<div className="mt-1.5 grid gap-0.5">{children}</div>
			{footer && <div className="mt-2 text-xs">{footer}</div>}
		</Root>
	);
}

/** A big, aligned figure (an amount or a count). */
export function Figure({ className, ...props }: ComponentProps<"p">) {
	return (
		<p
			className={cn(
				"text-xl font-semibold tracking-tight text-foreground tabular-nums",
				className,
			)}
			{...props}
		/>
	);
}
