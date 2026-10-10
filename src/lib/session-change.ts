/**
 * Go to `path` with a full document load after the session has changed (sign-in, sign-up,
 * sign-out, account deletion).
 *
 * A client-side navigation would keep this tab's router loader cache and query cache alive.
 * Their entries belong to the previous user and are rendered first while a background reload
 * runs, so on a shared device the next person briefly sees the last person's accounts and
 * transactions (reproduced in a real browser session). A new document starts with no
 * in-memory state at all.
 */
export function reloadTo(path: string) {
	window.location.assign(path);
}
