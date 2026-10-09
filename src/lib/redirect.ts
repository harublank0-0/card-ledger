/** Only allow same-site relative paths after sign-in (blocks open redirects like //evil.com). */
export function safeRedirect(target: string | undefined, fallback = "/") {
	if (!target || !target.startsWith("/") || target.startsWith("//"))
		return fallback;
	return target;
}
