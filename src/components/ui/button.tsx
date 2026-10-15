import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";
import type * as React from "react";

const buttonVariants = cva(
	"inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground shadow-xs hover:bg-primary-hover",
				destructive:
					"bg-destructive text-white shadow-xs hover:bg-destructive-hover focus-visible:outline-destructive",
				"destructive-outline":
					"border border-destructive-line bg-card text-destructive shadow-xs hover:border-destructive/40 hover:bg-destructive-soft focus-visible:outline-destructive",
				outline:
					"border border-border-strong bg-card text-foreground shadow-xs hover:border-[#b9c2ce] hover:bg-accent",
				secondary:
					"bg-secondary text-secondary-foreground hover:bg-accent hover:text-foreground",
				ghost: "text-muted-foreground hover:bg-accent hover:text-foreground",
				link: "h-auto px-0 text-primary underline-offset-4 hover:underline active:translate-y-0",
			},
			size: {
				default: "h-9 px-3.5 has-[>svg]:px-3",
				xs: "h-7 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3.5",
				sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
				lg: "h-10 px-5 has-[>svg]:px-4",
				icon: "size-9",
				"icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
				"icon-sm": "size-8",
				"icon-lg": "size-10",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	},
);

function Button({
	className,
	variant = "default",
	size = "default",
	asChild = false,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Comp = asChild ? Slot.Root : "button";

	return (
		<Comp
			data-slot="button"
			data-variant={variant}
			data-size={size}
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
