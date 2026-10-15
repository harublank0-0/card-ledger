import { cn } from "cn";

import { type CurrencyCode, formatMoneyParts } from "#/lib/money";

/**
 * An amount set like a ledger: the number carries the weight, the currency code sits beside it
 * in smaller grey type. It reads (and copies) as "NPR 4,000.00". Tabular figures keep columns
 * aligned. `figure` is for headline numbers, where the code is set smaller still.
 */
export function Money({
	minor,
	currency,
	figure = false,
	className,
	codeClassName = "text-muted-foreground",
}: {
	minor: number;
	currency: string;
	figure?: boolean;
	className?: string;
	/** Colour of the code; the default grey assumes a light background. */
	codeClassName?: string;
}) {
	const { sign, code, amount } = formatMoneyParts(
		minor,
		currency as CurrencyCode,
	);
	return (
		<span className={cn("whitespace-nowrap tabular-nums", className)}>
			{sign}
			<span
				className={cn(
					"font-medium tracking-wide",
					codeClassName,
					figure ? "text-[0.55em]" : "text-[0.8em]",
				)}
			>
				{code}
			</span>{" "}
			{amount}
		</span>
	);
}
