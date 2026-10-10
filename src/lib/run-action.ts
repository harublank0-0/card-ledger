import { GENERIC_ERROR_MESSAGE, toClientError } from "./client-errors";

export type ActionHandlers = {
	onStart: () => void;
	onError: (message: string) => void;
	onSettled: () => void;
};

export type ActionOutcome = "done" | "failed" | "ignored";

/**
 * Run a user-triggered async action at most once at a time.
 *
 * `gate` is a ref-like flag shared by every trigger of one screen, so a second click, or a
 * second button, while the first server call is still in flight is ignored instead of
 * sending the same mutation twice. A failure is turned into a message through the same
 * allowlist the server uses, and the gate is always released.
 */
export async function runGuarded(
	gate: { current: boolean },
	handlers: ActionHandlers,
	action: () => Promise<unknown>,
): Promise<ActionOutcome> {
	if (gate.current) return "ignored";
	gate.current = true;
	handlers.onStart();
	try {
		await action();
		return "done";
	} catch (error) {
		const safe = toClientError(error);
		handlers.onError(
			safe instanceof Error && safe.message
				? safe.message
				: GENERIC_ERROR_MESSAGE,
		);
		return "failed";
	} finally {
		gate.current = false;
		handlers.onSettled();
	}
}
