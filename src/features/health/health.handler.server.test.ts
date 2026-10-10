import { describe, expect, it } from "vitest";

import { handleHealthRequest } from "./health.handler.server";
import type { HealthResult } from "./health.logic";

const HEALTHY: HealthResult = {
	ok: true,
	checks: { database: "ok", migrations: "ok" },
};
const PENDING: HealthResult = {
	ok: false,
	checks: { database: "ok", migrations: "pending" },
};
const DOWN: HealthResult = {
	ok: false,
	checks: { database: "fail", migrations: "fail" },
};

const get = (method = "GET") =>
	new Request("http://localhost:3000/api/health", { method });

describe("handleHealthRequest", () => {
	it("answers 200 with a minimal body when healthy", async () => {
		const response = await handleHealthRequest(get(), {
			check: async () => HEALTHY,
			onError: () => {},
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ status: "ok" });
	});

	it("answers 503 with the check summary when a migration is pending", async () => {
		const response = await handleHealthRequest(get(), {
			check: async () => PENDING,
			onError: () => {},
		});
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({
			status: "unavailable",
			checks: { database: "ok", migrations: "pending" },
		});
	});

	it("answers 503 when the database is down", async () => {
		const response = await handleHealthRequest(get(), {
			check: async () => DOWN,
			onError: () => {},
		});
		expect(response.status).toBe(503);
		expect((await response.json()).checks.database).toBe("fail");
	});

	it("is never cacheable and not sniffable", async () => {
		const response = await handleHealthRequest(get(), {
			check: async () => HEALTHY,
			onError: () => {},
		});
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(response.headers.get("Content-Type")).toContain("application/json");
	});

	it("answers HEAD with the same status and no body", async () => {
		const response = await handleHealthRequest(get("HEAD"), {
			check: async () => PENDING,
			onError: () => {},
		});
		expect(response.status).toBe(503);
		expect(await response.text()).toBe("");
	});

	it("turns a thrown error into 503 without leaking its message", async () => {
		const seen: unknown[] = [];
		const response = await handleHealthRequest(get(), {
			check: async () => {
				throw new Error(
					"connect failed postgres://cardledger:s3cr3t@db:5432/x",
				);
			},
			onError: (error) => seen.push(error),
		});
		const text = await response.text();
		expect(response.status).toBe(503);
		expect(text).not.toContain("s3cr3t");
		expect(text).not.toContain("postgres");
		expect(JSON.parse(text)).toEqual({ status: "unavailable" });
		expect(seen).toHaveLength(1);
	});
});
