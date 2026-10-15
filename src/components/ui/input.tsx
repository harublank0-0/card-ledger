import { cn } from "cn";
import type * as React from "react";

/** Shared by inputs, textareas and select triggers so every field looks and focuses the same. */
export const fieldClasses =
	"rounded-lg border border-input bg-card text-base shadow-xs transition-[color,border-color,box-shadow] duration-150 outline-none placeholder:text-placeholder hover:border-[#b9c2ce] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:bg-secondary disabled:opacity-70 aria-invalid:border-destructive aria-invalid:ring-destructive/15 md:text-sm";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				fieldClasses,
				"h-9 w-full min-w-0 px-3 py-1 tabular-nums selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
				className,
			)}
			{...props}
		/>
	);
}

export { Input };
