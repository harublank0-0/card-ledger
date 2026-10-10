import { describe, expect, it } from "vitest";

import { GENERIC_ERROR_MESSAGE } from "./client-errors";
import { runGuarded } from "./run-action";

function setup() {
	const calls: string[] = [];
	const handlers = {
		onStart: () => calls.push("start"),
		onError: (message: string) => calls.push(`error:${message}`),
		onSettled: () => calls.push("settled"),
	};
	return { calls, handlers, gate: { current: false } };
}

describe("runGuarded", () => {
	it("runs the action and reports start then settled", async () => {
		const { calls, handlers, gate } = setup();
		const outcome = await runGuarded(gate, handlers, async () => {
			calls.push("action");
		});
		expect(outcome).toBe("done");
		expect(calls).toEqual(["start", "action", "settled"]);
		expect(gate.current).toBe(false);
	});

	it("ignores a second call while the first is in flight", async () => {
		const { calls, handlers, gate } = setup();
		let release: () => void = () => {};
		const first = runGuarded(
			gate,
			handlers,
			() =>
				new Promise<void>((resolve) => {
					calls.push("action");
					release = resolve;
				}),
		);
		// Double click: the same handler fires again before the first server call returns.
		const second = await runGuarded(gate, handlers, async () => {
			calls.push("second action");
		});
		expect(second).toBe("ignored");
		release();
		expect(await first).toBe("done");
		expect(calls).toEqual(["start", "action", "settled"]);
	});

	it("accepts a new call once the previous one has settled", async () => {
		const { handlers, gate } = setup();
		await runGuarded(gate, handlers, async () => {});
		expect(await runGuarded(gate, handlers, async () => {})).toBe("done");
	});

	it("shows a message the application wrote and releases the gate", async () => {
		const { calls, handlers, gate } = setup();
		const outcome = await runGuarded(gate, handlers, async () => {
			throw new Error("Subscription not found");
		});
		expect(outcome).toBe("failed");
		expect(calls).toEqual(["start", "error:Subscription not found", "settled"]);
		expect(gate.current).toBe(false);
	});

	it("replaces the text of an unexpected error with a generic one", async () => {
		const { calls, handlers, gate } = setup();
		await runGuarded(gate, handlers, async () => {
			throw new TypeError("connect ECONNREFUSED 10.0.0.5:5432");
		});
		expect(calls).toContain(`error:${GENERIC_ERROR_MESSAGE}`);
		expect(calls.join()).not.toContain("ECONNREFUSED");
	});

	it("handles a thrown value that is not an Error", async () => {
		const { calls, handlers, gate } = setup();
		await runGuarded(gate, handlers, async () => {
			throw "boom";
		});
		expect(calls).toContain(`error:${GENERIC_ERROR_MESSAGE}`);
	});
});
