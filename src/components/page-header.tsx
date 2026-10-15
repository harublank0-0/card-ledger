import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

type ListPage = "/transactions" | "/statements" | "/subscriptions" | "/cards";

/** "‹ Statements" above a detail or form page's title. */
export function BackLink({ to, children }: { to: ListPage; children: string }) {
	return (
		<Link
			to={to}
			className="-ml-1 mb-2 inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 text-sm text-muted-foreground transition-[color,background-color,border-color,text-decoration-color] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
		>
			<ChevronLeft aria-hidden="true" className="size-4" />
			{children}
		</Link>
	);
}

/**
 * The top of every page: where you are, a line on what the page is for, and the page's main
 * action on the right. On phones the actions move under the title.
 */
export function PageHeader({
	title,
	description,
	back,
	badge,
	actions,
}: {
	title: ReactNode;
	description?: ReactNode;
	back?: ReactNode;
	badge?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
			<div className="min-w-0">
				{back}
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
					<h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight text-foreground">
						{title}
					</h1>
					{badge}
				</div>
				{description && (
					<p className="mt-1 max-w-2xl text-sm text-muted-foreground">
						{description}
					</p>
				)}
			</div>
			{actions && (
				<div className="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end">
					{actions}
				</div>
			)}
		</header>
	);
}
