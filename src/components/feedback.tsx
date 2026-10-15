import { cn } from "cn";
import {
	CircleAlert,
	CircleCheck,
	Clock,
	Info,
	type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

export type Tone = "success" | "warning" | "danger" | "neutral";

const BADGE: Record<Tone, { className: string; icon: LucideIcon | null }> = {
	success: {
		className: "border-success-line bg-success-soft text-success",
		icon: CircleCheck,
	},
	warning: {
		className: "border-warning-line bg-warning-soft text-warning",
		icon: Clock,
	},
	danger: {
		className: "border-destructive-line bg-destructive-soft text-destructive",
		icon: CircleAlert,
	},
	neutral: {
		className: "border-border bg-secondary text-muted-foreground",
		icon: null,
	},
};

/**
 * A short state label ("Paid", "Overdue by 2 days", "Refund"). Colour is never the only
 * signal: the words carry the meaning and coloured tones add an icon.
 */
export function StatusBadge({
	tone = "neutral",
	children,
	className,
}: {
	tone?: Tone;
	children: ReactNode;
	className?: string;
}) {
	const { className: toneClass, icon: Icon } = BADGE[tone];
	return (
		<span
			className={cn(
				"inline-flex h-5 shrink-0 items-center gap-1 rounded-full border px-2 align-middle text-xs leading-none font-medium whitespace-nowrap",
				toneClass,
				className,
			)}
		>
			{Icon && <Icon aria-hidden="true" className="size-3.5" />}
			{children}
		</span>
	);
}

const ALERT: Record<
	"danger" | "warning" | "success" | "info",
	{ className: string; icon: LucideIcon }
> = {
	danger: {
		className: "border-destructive-line bg-destructive-soft text-destructive",
		icon: CircleAlert,
	},
	warning: {
		className: "border-warning-line bg-warning-soft text-warning",
		icon: Clock,
	},
	success: {
		className: "border-success-line bg-success-soft text-success",
		icon: CircleCheck,
	},
	info: {
		className: "border-transparent bg-secondary text-muted-foreground",
		icon: Info,
	},
};

/**
 * A message in the flow of the page. Errors are announced (`role="alert"`); everything else is
 * read in place.
 */
export function InlineAlert({
	tone,
	children,
	className,
}: {
	tone: keyof typeof ALERT;
	children: ReactNode;
	className?: string;
}) {
	const { className: toneClass, icon: Icon } = ALERT[tone];
	return (
		<div
			role={tone === "danger" ? "alert" : undefined}
			className={cn(
				"flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm",
				toneClass,
				className,
			)}
		>
			<Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
			<div className="min-w-0">{children}</div>
		</div>
	);
}

/** The error from a failed action, or nothing. */
export function ActionError({
	error,
	className,
}: {
	error: string | null;
	className?: string;
}) {
	if (!error) return null;
	return (
		<InlineAlert tone="danger" className={className}>
			{error}
		</InlineAlert>
	);
}

/** What an empty list says, and the one thing to do about it. */
export function EmptyState({
	icon: Icon,
	title,
	children,
	action,
}: {
	icon: LucideIcon;
	title: string;
	children?: ReactNode;
	action?: ReactNode;
}) {
	return (
		<div className="flex flex-col items-center px-6 py-12 text-center">
			<div className="mb-3 flex size-10 items-center justify-center rounded-full bg-secondary text-muted-foreground">
				<Icon aria-hidden="true" className="size-5" />
			</div>
			<p className="font-medium text-foreground">{title}</p>
			{children && (
				<p className="mt-1 max-w-sm text-sm text-muted-foreground">
					{children}
				</p>
			)}
			{action && <div className="mt-4">{action}</div>}
		</div>
	);
}
