import { cn } from "cn";

import type { Tone } from "#/components/feedback";
import { type CalendarDate, dayAndMonth } from "#/lib/calendar-date";

const TONE: Record<Tone, string> = {
	neutral: "border-border bg-background text-foreground",
	success: "border-success-line bg-success-soft text-success",
	warning: "border-warning-line bg-warning-soft text-warning",
	danger: "border-destructive-line bg-destructive-soft text-destructive",
};

/**
 * A small calendar leaf ("15 / Oct") at the start of a ledger row. The full date stays
 * available to assistive technology and as a tooltip.
 */
export function DateTile({
	date,
	tone = "neutral",
	className,
}: {
	date: CalendarDate;
	tone?: Tone;
	className?: string;
}) {
	const { day, month } = dayAndMonth(date);
	return (
		<time
			dateTime={date}
			title={date}
			className={cn(
				"flex w-11 shrink-0 flex-col items-center justify-center rounded-lg border py-1 leading-none",
				TONE[tone],
				className,
			)}
		>
			<span
				aria-hidden="true"
				className="text-[15px] font-semibold tabular-nums"
			>
				{day}
			</span>
			<span
				aria-hidden="true"
				className="mt-0.5 text-[10px] font-medium tracking-wide opacity-75"
			>
				{month}
			</span>
			<span className="sr-only">{date}</span>
		</time>
	);
}
