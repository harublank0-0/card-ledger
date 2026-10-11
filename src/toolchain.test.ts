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

	it("is the line every CI job sets up (from .nvmrc, or the same major)", () => {
		const ci = read(".github/workflows/ci.yml");
		const setups = (ci.match(/uses:\s*actions\/setup-node@/g) ?? []).length;
		const pinned = (
			ci.match(
				new RegExp(`node-version(-file)?:\\s*(${major}|\\.nvmrc)\\s*$`, "gm"),
			) ?? []
		).length;
		expect(setups).toBeGreaterThan(0);
		expect(pinned).toBe(setups);
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

describe("pnpm is the only package manager", () => {
	const ci = read(".github/workflows/ci.yml");
	const drill = read(".github/workflows/backup-drill.yml");
	const npmCommand =
		/\bnpm (ci|install|i|run|test|audit|exec)\b|\bnpx\b|cache:\s*npm/;

	it("has one lockfile, pnpm's", () => {
		expect(existsSync(path.join(root, "pnpm-lock.yaml"))).toBe(true);
		for (const other of [
			"package-lock.json",
			"npm-shrinkwrap.json",
			"yarn.lock",
			"bun.lock",
			"bun.lockb",
		]) {
			expect(existsSync(path.join(root, other)), other).toBe(false);
		}
	});

	it("keeps pnpm's settings in pnpm-workspace.yaml, which pnpm 12 reads instead of package.json", () => {
		expect(pkg.pnpm).toBeUndefined();
		expect(pkg.overrides).toBeUndefined();
		expect(existsSync(path.join(root, "pnpm-workspace.yaml"))).toBe(true);
	});

	it("installs from the frozen lockfile inside the Docker image", () => {
		const dockerfile = read("Dockerfile");
		expect(dockerfile).toContain("pnpm-lock.yaml");
		const installs = dockerfile
			.split("\n")
			.filter((line) => /\bpnpm install\b/.test(line));
		expect(installs.length).toBeGreaterThanOrEqual(2);
		for (const line of installs) expect(line).toContain("--frozen-lockfile");
		expect(dockerfile).toMatch(/pnpm install --frozen-lockfile --prod/);
		expect(dockerfile).not.toMatch(npmCommand);
	});

	it("installs from the frozen lockfile and runs through pnpm in CI", () => {
		const installs = ci
			.split("\n")
			.filter((line) => /\bpnpm install\b/.test(line));
		expect(installs.length).toBeGreaterThan(0);
		for (const line of installs) expect(line).toContain("--frozen-lockfile");
		expect(ci).toContain("corepack enable");
		expect(ci).not.toMatch(npmCommand);
		expect(drill).not.toMatch(npmCommand);
	});

	it("has no npm command in the package.json scripts", () => {
		for (const [name, command] of Object.entries<string>(pkg.scripts)) {
			expect(command, name).not.toMatch(npmCommand);
		}
	});

	it("lists production packages with pnpm in the licence check", () => {
		const script = read("scripts/check-licenses.ts");
		expect(script).toMatch(/execFileSync\(\s*"pnpm"/);
		expect(script).not.toMatch(/execFileSync\(\s*"npm"/);
	});
});
