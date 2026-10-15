import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ActionError, InlineAlert, StatusBadge } from "./feedback";

describe("StatusBadge", () => {
	// Colour is never the only signal: the words are always there, and a coloured tone adds an
	// icon so the state survives colour blindness and greyscale printing.
	it.each([
		"success",
		"warning",
		"danger",
	] as const)("a %s badge has its words and an icon", (tone) => {
		const html = renderToStaticMarkup(
			<StatusBadge tone={tone}>Overdue by 2 days</StatusBadge>,
		);
		expect(html).toContain("Overdue by 2 days");
		expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
	});

	it("a neutral badge is just its words", () => {
		const html = renderToStaticMarkup(<StatusBadge>Refund</StatusBadge>);
		expect(html).toMatch(/>Refund<\/span>$/);
		expect(html).not.toContain("<svg");
	});
});

describe("InlineAlert", () => {
	it("announces errors", () => {
		const html = renderToStaticMarkup(
			<InlineAlert tone="danger">Card not found</InlineAlert>,
		);
		expect(html).toMatch(/role="alert"/);
		expect(html).toContain("Card not found");
	});

	it("does not interrupt for notes", () => {
		const html = renderToStaticMarkup(
			<InlineAlert tone="info">
				Only the last four digits are saved.
			</InlineAlert>,
		);
		expect(html).not.toMatch(/role="alert"/);
	});

	it("ActionError renders nothing without an error", () => {
		expect(renderToStaticMarkup(<ActionError error={null} />)).toBe("");
		expect(
			renderToStaticMarkup(<ActionError error="Something went wrong" />),
		).toMatch(/role="alert"/);
	});
});

describe("motion", () => {
	// Menus, dialogs, the phone menu and toasts animate; people who ask their system for less
	// motion get the state change without the movement.
	it("the stylesheet switches animations and transitions off for reduced motion", () => {
		const css = readFileSync(
			path.join(process.cwd(), "src/styles.css"),
			"utf8",
		);
		const block = css.slice(
			css.indexOf("@media (prefers-reduced-motion: reduce)"),
		);
		expect(block).not.toBe(css);
		expect(block).toMatch(/animation-duration:\s*0\.01ms !important/);
		expect(block).toMatch(/transition-duration:\s*0\.01ms !important/);
	});
});
