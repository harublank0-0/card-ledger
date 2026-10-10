/** `head` for a route: "<Page> · Card Ledger". Generic on purpose: no names or amounts. */
export function pageTitle(page: string) {
	return () => ({ meta: [{ title: `${page} · Card Ledger` }] });
}
