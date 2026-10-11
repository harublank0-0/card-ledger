import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// One Node.js line and one package manager, named the same way everywhere the project is
// installed, built or run: a developer's shell, the Docker image and CI. A mismatch is how
// "works on my machine" and a lockfile that nobody's tool reads come about.
const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
const pkg = JSON.parse(read("package.json"));

describe("Node.js version", () => {
	const nvmrc = read(".nvmrc").trim();
	const major = nvmrc;

	it("is one major line in .nvmrc (nvm, fnm, asdf and others read it)", () => {
		expect(nvmrc).toMatch(/^\d+$/);
	});

	it("is the only line package.json engines accepts", () => {
		expect(pkg.engines?.node).toBe(`^${major}`);
	});

	it("is the line the Docker image is built on", () => {
		expect(read("Dockerfile")).toMatch(
			new RegExp(`^ARG NODE_VERSION=${major}$`, "m"),
		);
	});

	it("is the line every CI job sets up", () => {
		const versions = [
			...read(".github/workflows/ci.yml").matchAll(/node-version:\s*(\S+)/g),
		].map((match) => match[1]);
		expect(versions.length).toBeGreaterThan(0);
		for (const version of versions) expect(version).toBe(major);
	});

	it("is enforced, not only advised, by the installing package manager", () => {
		expect(read(".npmrc")).toMatch(/^engine-strict=true$/m);
	});

	it("is the version the tests are running on", () => {
		expect(process.versions.node.split(".")[0]).toBe(major);
	});
});

describe("package manager", () => {
	it("is named exactly in package.json, so Corepack and CI resolve the same one", () => {
		expect(pkg.packageManager).toMatch(
			/^pnpm@\d+\.\d+\.\d+(\+sha\d+\.[0-9a-f]+)?$/,
		);
	});

	it("is the same major line in engines.pnpm", () => {
		const pinned = String(pkg.packageManager).match(
			/^pnpm@(\d+)\.(\d+)\.(\d+)/,
		);
		expect(pinned).not.toBeNull();
		expect(pkg.engines?.pnpm).toBe(
			`^${pinned?.[1]}.${pinned?.[2]}.${pinned?.[3]}`,
		);
	});
});
