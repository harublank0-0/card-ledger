import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	clearToasts,
	dismissToast,
	getToasts,
	notify,
	subscribeToasts,
	TOAST_DURATION_MS,
} from "./toast";

describe("toast store", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		clearToasts();
	});
	afterEach(() => {
		clearToasts();
		vi.useRealTimers();
	});

	it("shows a message and tells subscribers", () => {
		const listener = vi.fn();
		const unsubscribe = subscribeToasts(listener);
		notify("Transaction saved");
		expect(getToasts().map((t) => t.message)).toEqual(["Transaction saved"]);
		expect(listener).toHaveBeenCalledTimes(1);
		unsubscribe();
		notify("Card saved");
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("hides a message on its own after a few seconds", () => {
		notify("Payment recorded");
		vi.advanceTimersByTime(TOAST_DURATION_MS - 1);
		expect(getToasts()).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(getToasts()).toHaveLength(0);
	});

	it("can be dismissed early, and only that message goes", () => {
		notify("First");
		notify("Second");
		const [first] = getToasts();
		dismissToast(first?.id ?? -1);
		expect(getToasts().map((t) => t.message)).toEqual(["Second"]);
	});

	it("keeps at most three messages, dropping the oldest", () => {
		for (const message of ["1", "2", "3", "4"]) notify(message);
		expect(getToasts().map((t) => t.message)).toEqual(["2", "3", "4"]);
	});

	it("returns the same list object until something changes", () => {
		notify("Saved");
		expect(getToasts()).toBe(getToasts());
	});
});
