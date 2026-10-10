import { Link } from "@tanstack/react-router";

import { Button } from "#/components/ui/button";
import { GENERIC_ERROR_MESSAGE, toClientError } from "#/lib/client-errors";

/** Shown for a URL that matches no page, and for a `notFound()` no route handles itself. */
export function RouteNotFound() {
	return (
		<section className="mx-auto grid max-w-md gap-3 p-6 text-center">
			<h1 className="text-2xl font-semibold">Page not found</h1>
			<p className="text-sm text-muted-foreground">
				That page does not exist, or it is not yours to see.
			</p>
			<div>
				<Button asChild variant="outline">
					<Link to="/">Back to the dashboard</Link>
				</Button>
			</div>
		</section>
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
		<section className="mx-auto grid max-w-md gap-3 p-6 text-center">
			<h1 className="text-2xl font-semibold">Something went wrong</h1>
			<p role="alert" className="text-sm text-muted-foreground">
				{message}
			</p>
			<div className="flex justify-center gap-2">
				<Button onClick={reset}>Try again</Button>
				<Button asChild variant="outline">
					<Link to="/">Back to the dashboard</Link>
				</Button>
			</div>
		</section>
	);
}
