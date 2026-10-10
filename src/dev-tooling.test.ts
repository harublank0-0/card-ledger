import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const pkg = JSON.parse(read("package.json")) as {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
};

// `@tanstack/devtools-vite` runs an unauthenticated HTTP bus on localhost:4206 during
// `vite dev` whose "install-devtools" event executes `npm install -D <payload>` through a
// shell, plus middleware that opens editors for client-supplied paths and streams console
// output with `Access-Control-Allow-Origin: *`. Any web page could reach it. The in-app
// panels need none of it.
describe("development tooling", () => {
	it("does not run the TanStack devtools Vite plugin or its event bus", () => {
		const config = read("vite.config.ts");
		expect(config).not.toContain("@tanstack/devtools-vite");
		expect(config).not.toMatch(/\bdevtools\(/);
	});

	it("does not depend on the devtools shell, plugin or event bus", () => {
		const all = { ...pkg.dependencies, ...pkg.devDependencies };
		for (const name of [
			"@tanstack/devtools-vite",
			"@tanstack/react-devtools",
			"@tanstack/devtools-event-bus",
			"@tanstack/devtools",
		]) {
			expect(all[name], name).toBeUndefined();
		}
		const lock = read("package-lock.json");
		expect(lock).not.toContain("node_modules/@tanstack/devtools-vite");
		expect(lock).not.toContain("node_modules/@tanstack/devtools-event-bus");
	});

	it("keeps every devtools package out of the production dependencies", () => {
		const production = Object.keys(pkg.dependencies ?? {}).filter((name) =>
			name.includes("devtools"),
		);
		expect(production).toEqual([]);
	});

	it("loads the in-app panels only in development, through a dynamic import", () => {
		const root_ = read("src/routes/__root.tsx");
		expect(root_).not.toMatch(/from\s+["'][^"']*devtools[^"']*["']/);
		expect(root_).toMatch(/import\.meta\.env\.DEV/);
		expect(root_).toMatch(/import\(\s*["'][^"']*devtools[^"']*["']\s*\)/);
	});
});
