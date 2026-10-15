import { Link } from "@tanstack/react-router";
import { cn } from "cn";

/** The mark: a ledger page, rows on the left and amounts on the right. */
export function BrandMark({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 24 24"
			aria-hidden="true"
			className={cn("size-7 shrink-0", className)}
		>
			<rect width="24" height="24" rx="7" fill="var(--primary)" />
			<g stroke="#fff" strokeLinecap="round" strokeWidth="1.8">
				<path d="M6.5 8.5h6M15.5 8.5h2" />
				<path d="M6.5 12h4.5M15.5 12h2" opacity="0.8" />
				<path d="M6.5 15.5h5.5M15.5 15.5h2" opacity="0.6" />
			</g>
		</svg>
	);
}

export function Brand({ onNavigate }: { onNavigate?: () => void }) {
	return (
		<Link
			to="/"
			onClick={onNavigate}
			className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
		>
			<BrandMark />
			<span className="text-[15px] font-semibold tracking-tight text-foreground">
				Card Ledger
			</span>
		</Link>
	);
}
