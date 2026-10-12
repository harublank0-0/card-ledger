import { H3 } from "nitro/h3";
import { describe, expect, it } from "vitest";

import bodyLimit, { MAX_BODY_BYTES } from "./body-limit";

/** A tiny app with only the middleware and an echo route, so what is under test is the limit. */
function app() {
	const server = new H3();
	server.use(bodyLimit);
	server.all("/echo", async (event) => {
		const text = event.req.body ? await event.req.text() : "";
		return { received: text.length, method: event.req.method };
	});
	return server;
}

const post = async (body: BodyInit | null) =>
	await app().request("/echo", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body,
		// Required by fetch when the body is a stream.
		...(body instanceof ReadableStream ? { duplex: "half" } : {}),
	} as RequestInit);

/** A body that is sent in chunks with no Content-Length, like a chunked upload. */
function streamOf(totalBytes: number, chunkBytes = 64 * 1024) {
	let sent = 0;
	return new ReadableStream<Uint8Array>({
		pull(controller) {
			if (sent >= totalBytes) return controller.close();
			const size = Math.min(chunkBytes, totalBytes - sent);
			controller.enqueue(new Uint8Array(size).fill(97));
			sent += size;
		},
	});
}

describe("request body limit", () => {
	it("is one mebibyte", () => {
		expect(MAX_BODY_BYTES).toBe(1_048_576);
	});

	it("lets an ordinary request through", async () => {
		const response = await post(
			JSON.stringify({ email: "a@b.test", password: "x" }),
		);
		expect(response.status).toBe(200);
		expect((await response.json()).received).toBeGreaterThan(0);
	});

	it("lets a body of exactly the limit through", async () => {
		const response = await post("a".repeat(MAX_BODY_BYTES));
		expect(response.status).toBe(200);
		expect((await response.json()).received).toBe(MAX_BODY_BYTES);
	});

	it("refuses a body one byte over the limit with 413", async () => {
		const response = await post("a".repeat(MAX_BODY_BYTES + 1));
		expect(response.status).toBe(413);
	});

	it("refuses an over-limit stream that declares no length", async () => {
		const response = await post(streamOf(MAX_BODY_BYTES * 3));
		expect(response.status).toBe(413);
	});

	it("lets a stream under the limit through", async () => {
		const response = await post(streamOf(100 * 1024));
		expect(response.status).toBe(200);
		expect((await response.json()).received).toBe(100 * 1024);
	});

	it("does not touch requests that have no body", async () => {
		const response = await app().request("/echo");
		expect(response.status).toBe(200);
		expect((await response.json()).method).toBe("GET");
	});

	it("answers without leaking internals", async () => {
		const response = await post("a".repeat(MAX_BODY_BYTES + 1));
		const text = await response.text();
		expect(response.status).toBe(413);
		expect(text).not.toMatch(/at .*\(.*:\d+:\d+\)/); // no stack trace
		expect(text.toLowerCase()).not.toContain("database");
		expect(text).not.toContain(process.cwd());
	});
});
