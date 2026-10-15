import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { CircleAlert, Compass } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "#/components/ui/button";
import { GENERIC_ERROR_MESSAGE, toClientError } from "#/lib/client-errors";

function Fallback({
	icon: Icon,
	tone,
	title,
	children,
	actions,
}: {
	icon: LucideIcon;
	tone: "neutral" | "danger";
	title: string;
	children: ReactNode;
	actions: ReactNode;
}) {
	return (
		<section className="mx-auto grid max-w-md justify-items-center gap-3 px-6 py-16 text-center">
			<div
				className={
					tone === "danger"
						? "flex size-11 items-center justify-center rounded-full bg-destructive-soft text-destructive"
						: "flex size-11 items-center justify-center rounded-full bg-secondary text-muted-foreground"
				}
			>
				<Icon aria-hidden="true" className="size-5" />
			</div>
			<h1 className="text-xl font-semibold tracking-tight">{title}</h1>
			{children}
			<div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div>
		</section>
	);
}

/** Shown for a URL that matches no page, and for a `notFound()` no route handles itself. */
export function RouteNotFound() {
	return (
		<Fallback
			icon={Compass}
			tone="neutral"
			title="Page not found"
			actions={
				<Button asChild variant="outline">
					<Link to="/">Back to the dashboard</Link>
				</Button>
			}
		>
			<p className="text-sm text-muted-foreground">
				That page does not exist, or it is not yours to see.
			</p>
		</Fallback>
	);
}

/**
 * Shown when a route fails to load or render. The text goes through the same allowlist the
 * server uses: a message this application wrote is shown, anything else becomes a generic
 * one, so a raw runtime error (host names, query fragments) never reaches the screen.
 */
export function RouteError({
	error,
	reset,
}: {
	error: unknown;
	reset: () => void;
}) {
	const safe = toClientError(error);
	const message =
		safe instanceof Error && safe.message
			? safe.message
			: GENERIC_ERROR_MESSAGE;
	return (
		<Fallback
			icon={CircleAlert}
			tone="danger"
			title="Something went wrong"
			actions={
				<>
					<Button onClick={reset}>Try again</Button>
					<Button asChild variant="outline">
						<Link to="/">Back to the dashboard</Link>
					</Button>
				</>
			}
		>
			<p role="alert" className="text-sm text-muted-foreground">
				{message}
			</p>
		</Fallback>
	);
}

/** A detail route's own "not found" (a record that is gone or not yours), inside the shell. */
export function RecordNotFound({
	title,
	back,
}: {
	title: string;
	back: ReactNode;
}) {
	return (
		<Fallback icon={Compass} tone="neutral" title={title} actions={back}>
			<p className="text-sm text-muted-foreground">
				It may have been deleted, or the link is wrong.
			</p>
		</Fallback>
	);
}
