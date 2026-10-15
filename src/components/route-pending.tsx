/**
 * Shown in the content area when a page takes more than a moment to load. It has the shape of
 * a page (title, figures, a table) so nothing jumps when the real content arrives, and the
 * sidebar stays where it is.
 */
export function RoutePending() {
	return (
		<div aria-busy="true" className="grid gap-6">
			<output className="sr-only">Loading…</output>
			<div className="grid gap-2">
				<Bar className="h-7 w-48" />
				<Bar className="h-4 w-72 max-w-full" />
			</div>
			<div className="h-24 rounded-xl border bg-card" />
			<div className="overflow-hidden rounded-xl border bg-card">
				<div className="h-12 border-b" />
				{[0, 1, 2, 3, 4, 5].map((row) => (
					<div
						key={row}
						className="flex items-center justify-between gap-4 border-b px-5 py-4 last:border-0"
					>
						<Bar className="h-4 w-56 max-w-[60%]" />
						<Bar className="h-4 w-20" />
					</div>
				))}
			</div>
		</div>
	);
}

function Bar({ className }: { className: string }) {
	return (
		<div
			className={`animate-skeleton rounded-md bg-secondary motion-reduce:animate-none ${className}`}
		/>
	);
}
