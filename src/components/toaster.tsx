import { CircleCheck, X } from "lucide-react";
import { useSyncExternalStore } from "react";

import {
	dismissToast,
	getServerToasts,
	getToasts,
	subscribeToasts,
} from "#/lib/toast";

/** Where `notify()` messages appear: bottom right on wide screens, bottom centre on phones. */
export function Toaster() {
	const toasts = useSyncExternalStore(
		subscribeToasts,
		getToasts,
		getServerToasts,
	);

	return (
		<section
			aria-label="Notifications"
			className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] sm:inset-x-auto sm:right-6 sm:bottom-6"
		>
			<output
				aria-live="polite"
				className="flex flex-col items-center gap-2 sm:items-end"
			>
				{toasts.map((toast) => (
					<div
						key={toast.id}
						className="pointer-events-auto flex w-full max-w-sm animate-toast-in items-center gap-3 rounded-xl border bg-card py-2.5 pr-2 pl-3.5 shadow-raised sm:w-auto sm:min-w-72"
					>
						<CircleCheck aria-hidden="true" className="size-4 text-primary" />
						<p className="flex-1 font-medium">{toast.message}</p>
						<button
							type="button"
							onClick={() => dismissToast(toast.id)}
							className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color,border-color,text-decoration-color] hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
						>
							<X aria-hidden="true" className="size-3.5" />
							<span className="sr-only">Dismiss</span>
						</button>
					</div>
				))}
			</output>
		</section>
	);
}
