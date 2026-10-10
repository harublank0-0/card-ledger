/**
 * What pasting into the "last 4 digits" field should leave there. People copy a whole card
 * number out of a statement or a wallet app; what this application keeps is only the last four
 * digits, and the rest is discarded here, in the browser, before it reaches any state.
 */
export function last4FromPaste(text: string): string {
	return text.replace(/\D/g, "").slice(-4);
}
