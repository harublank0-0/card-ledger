import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { reloadTo } from "./lib/session-change";

const read = (file: string) =>
	readFileSync(path.join(process.cwd(), file), "utf8");

afterEach(() => vi.unstubAllGlobals());

describe("reloadTo", () => {
	it("loads the target as a new document, so no cached state survives", () => {
		const assign = vi.fn();
		vi.stubGlobal("window", { location: { assign } });
		reloadTo("/sign-in");
		expect(assign).toHaveBeenCalledExactlyOnceWith("/sign-in");
	});
});

// A client-side navigation after the session changed kept the previous user's router and
// query caches alive in the tab, and rendered them first for the next user (reproduced in a
// real browser: A's subscriptions, cards and transactions appeared for B). The behavioural
// proof needs a browser; this keeps every session-changing flow on a full document load.
describe("flows that change the session", () => {
	it.each([
		["sign out", "src/components/app-shell.tsx"],
		["sign in", "src/routes/sign-in.tsx"],
		["sign up", "src/routes/sign-up.tsx"],
		["account deletion", "src/features/account/components/delete-account.tsx"],
	])("%s leaves with a full document load, not a client-side navigation", (_name, file) => {
		const code = read(file);
		expect(code, file).toMatch(/reloadTo\(/);
		expect(code, file).not.toMatch(/router\.navigate\(/);
		expect(code, file).not.toMatch(/router\.invalidate\(/);
	});
});

// Cancel and Reactivate change `expiresOn` on the server while the edit form, once touched,
// keeps its old values: "Save changes" afterwards erased the end date the person had just set
// (reproduced in a real browser). The form is re-initialised when those fields change.
describe("the subscription edit page", () => {
	it("re-initialises its form when status or end date change on the server", () => {
		const code = read("src/routes/_authed/subscriptions/$subscriptionId.tsx");
		// The key is a template literal, so match up to its closing backtick.
		const key =
			code.match(/<SubscriptionForm[\s\S]*?key=\{(`[^`]*`)\}/)?.[1] ?? "";
		expect(key).toContain("s.status");
		expect(key).toContain("s.expiresOn");
	});
});
