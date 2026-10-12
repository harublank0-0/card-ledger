import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const config = readFileSync(resolve(root, "vite.config.ts"), "utf8");

// The middleware is only useful if the build actually registers it. A unit test of the
// middleware alone cannot notice that the registration was removed or mistyped.
describe("body limit registration", () => {
	it("registers the middleware for every route", () => {
		const handlers =
			/handlers:\s*\[([\s\S]*?)\n\t\t\t\],/.exec(config)?.[1] ?? "";
		expect(handlers).toMatch(/route:\s*"\/\*\*"/);
		expect(handlers).toMatch(/middleware:\s*true/);
		expect(handlers).toMatch(/handler:\s*"\.\/src\/server\/body-limit\.ts"/);
	});

	it("points at a file that exists and exports a default handler", () => {
		const file = resolve(root, "src/server/body-limit.ts");
		expect(existsSync(file)).toBe(true);
		expect(readFileSync(file, "utf8")).toMatch(
			/export default defineMiddleware\(/,
		);
	});

	it("does not rely on the Nitro request hook, whose errors are only logged", () => {
		const startup = readFileSync(
			resolve(root, "src/server/startup.ts"),
			"utf8",
		);
		expect(startup).not.toMatch(/hooks\.hook\(\s*["']request["']/);
	});
});
