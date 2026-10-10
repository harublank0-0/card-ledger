/**
 * Only allow same-site relative paths after sign-in (blocks open redirects like //evil.com).
 *
 * Browsers parse a URL leniently: a backslash counts as a slash, and tabs and newlines are
 * dropped, so "/\\evil.com" and "/\t/evil.com" both mean "//evil.com". Those are refused too.
 */
export function safeRedirect(target: string | undefined, fallback = "/") {
	if (!target || !target.startsWith("/") || target.startsWith("//"))
		return fallback;
	// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are the point
	if (/[\\\u0000-\u001f\u007f]/.test(target)) return fallback;
	return target;
}
