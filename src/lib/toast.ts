/**
 * Short confirmations ("Transaction saved") shown after an action succeeds. A tiny store read
 * with `useSyncExternalStore`, so any screen can announce a result even when it navigates
 * away in the same breath. Messages must not contain amounts, names or notes: they are
 * generic on purpose, like page titles. Failures are not toasts; they stay next to the
 * control that failed.
 */
export type Toast = { id: number; message: string };

export const TOAST_DURATION_MS = 4000;
const MAX_TOASTS = 3;

let toasts: Toast[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function emit() {
	for (const listener of listeners) listener();
}

export function notify(message: string) {
	const id = nextId++;
	const kept = [...toasts, { id, message }];
	for (const dropped of kept.slice(0, -MAX_TOASTS)) forget(dropped.id);
	toasts = kept.slice(-MAX_TOASTS);
	timers.set(
		id,
		setTimeout(() => dismissToast(id), TOAST_DURATION_MS),
	);
	emit();
}

function forget(id: number) {
	clearTimeout(timers.get(id));
	timers.delete(id);
}

export function dismissToast(id: number) {
	if (!toasts.some((t) => t.id === id)) return;
	forget(id);
	toasts = toasts.filter((t) => t.id !== id);
	emit();
}

export function clearToasts() {
	for (const id of timers.keys()) forget(id);
	toasts = [];
	emit();
}

export function subscribeToasts(listener: () => void) {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function getToasts() {
	return toasts;
}

const NONE: Toast[] = [];
/** The server never has toasts to show. */
export function getServerToasts() {
	return NONE;
}
