import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Input } from "#/components/ui/input";
import { FormField } from "./form-field";

const html = (ui: React.ReactElement) =>
	renderToString(ui).replace(/<!--.*?-->/g, "");

describe("FormField accessibility", () => {
	it("marks the control invalid and points it at the error", () => {
		const out = html(
			<FormField label="Name" htmlFor="name" errors={["Name is required"]}>
				<Input id="name" />
			</FormField>,
		);
		expect(out).toMatch(/<input[^>]*aria-invalid="true"/);
		expect(out).toMatch(/<input[^>]*aria-describedby="name-error"/);
		expect(out).toMatch(/<p[^>]*id="name-error"[^>]*>Name is required<\/p>/);
	});

	it("points the control at every message when there are several", () => {
		const out = html(
			<FormField
				label="Name"
				htmlFor="name"
				errors={["Too short", "No digits"]}
			>
				<Input id="name" />
			</FormField>,
		);
		expect(out).toMatch(
			/<input[^>]*aria-describedby="name-error name-error-1"/,
		);
		expect(out).toMatch(/id="name-error-1"/);
	});

	it("describes the control with the hint when there is no error", () => {
		const out = html(
			<FormField
				label="Name"
				htmlFor="name"
				errors={[]}
				hint="For example: Daily"
			>
				<Input id="name" />
			</FormField>,
		);
		expect(out).toMatch(/<input[^>]*aria-describedby="name-hint"/);
		expect(out).not.toMatch(/\saria-invalid="/);
		expect(out).toMatch(/<p[^>]*id="name-hint"[^>]*>For example: Daily<\/p>/);
	});

	it("adds nothing when there is neither a hint nor an error", () => {
		const out = html(
			<FormField label="Name" htmlFor="name" errors={[]}>
				<Input id="name" />
			</FormField>,
		);
		expect(out).not.toMatch(/\saria-invalid="/);
		expect(out).not.toMatch(/\saria-describedby="/);
	});

	it("keeps a description the control already has", () => {
		const out = html(
			<FormField label="Name" htmlFor="name" errors={["Bad"]}>
				<Input id="name" aria-describedby="extra" />
			</FormField>,
		);
		expect(out).toMatch(/aria-describedby="extra name-error"/);
	});
});
