import { cn } from "cn";
import type * as React from "react";

/**
 * Ledger tables: quiet header, hairline rows, numbers right-aligned in tabular figures.
 * Mark numeric cells with `numeric` so the column lines up on the decimal places.
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
	return (
		<div
			data-slot="table-container"
			className="relative w-full overflow-x-auto"
		>
			<table
				data-slot="table"
				className={cn(
					"w-full caption-bottom border-collapse text-sm",
					className,
				)}
				{...props}
			/>
		</div>
	);
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
	return (
		<thead
			data-slot="table-header"
			className={cn("bg-background/70 [&_tr]:border-b", className)}
			{...props}
		/>
	);
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
	return (
		<tbody
			data-slot="table-body"
			className={cn("[&_tr:last-child]:border-0", className)}
			{...props}
		/>
	);
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
	return (
		<tfoot
			data-slot="table-footer"
			className={cn("border-t font-medium [&>tr]:last:border-b-0", className)}
			{...props}
		/>
	);
}

function TableRow({
	className,
	interactive = false,
	...props
}: React.ComponentProps<"tr"> & {
	/** The row holds a link that covers it: highlight the whole row on hover. */
	interactive?: boolean;
}) {
	return (
		<tr
			data-slot="table-row"
			className={cn(
				"border-b transition-colors duration-100",
				interactive &&
					"relative hover:bg-background/80 has-[a:focus-visible]:bg-background/80",
				className,
			)}
			{...props}
		/>
	);
}

function TableHead({
	className,
	numeric = false,
	...props
}: React.ComponentProps<"th"> & { numeric?: boolean }) {
	return (
		<th
			data-slot="table-head"
			className={cn(
				"h-9 px-3 text-left align-middle text-xs font-medium whitespace-nowrap text-muted-foreground first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5",
				numeric && "text-right",
				className,
			)}
			{...props}
		/>
	);
}

function TableCell({
	className,
	numeric = false,
	...props
}: React.ComponentProps<"td"> & { numeric?: boolean }) {
	return (
		<td
			data-slot="table-cell"
			className={cn(
				"px-3 py-2.5 align-top first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5",
				numeric && "text-right font-medium whitespace-nowrap tabular-nums",
				className,
			)}
			{...props}
		/>
	);
}

/** A link that makes its whole table row clickable. Other controls in the row need `relative z-10`. */
const rowLinkClass =
	"font-medium text-foreground outline-none after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ring";

export {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
	rowLinkClass,
};
