import { useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";

import { runGuarded } from "./run-action";

/**
 * A screen's mutation runner: one call at a time, the error shown in one place, and the
 * route data reloaded after a success. Disable controls with `pending`.
 */
export function useAction() {
	const router = useRouter();
	const gate = useRef(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const run = (action: () => Promise<unknown>) =>
		runGuarded(
			gate,
			{
				onStart: () => {
					setPending(true);
					setError(null);
				},
				onError: setError,
				onSettled: () => setPending(false),
			},
			async () => {
				await action();
				await router.invalidate();
			},
		);

	return { run, pending, error };
}
