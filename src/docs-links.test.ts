import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function walk(dir: string): string[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir).flatMap((name) => {
		const full = path.join(dir, name);
		return statSync(full).isDirectory() ? walk(full) : [full];
	});
}

/** Every Markdown file a visitor of the repository can click through. */
function markdownFiles(): string[] {
	const top = [
		"README.md",
		"CONTRIBUTING.md",
		"SECURITY.md",
		"CODE_OF_CONDUCT.md",
	]
		.map((file) => path.join(root, file))
		.filter((file) => existsSync(file));
	const docs = walk(path.join(root, "docs")).filter((file) =>
		file.endsWith(".md"),
	);
	const github = walk(path.join(root, ".github")).filter((file) =>
		file.endsWith(".md"),
	);
	return [...top, ...docs, ...github];
}

/** Relative link targets in a Markdown file, ignoring code blocks and spans. */
function relativeLinks(markdown: string): string[] {
	const withoutCode = markdown
		.replace(/```[\s\S]*?```/g, "")
		.replace(/`[^`\n]*`/g, "");
	const links: string[] = [];
	for (const match of withoutCode.matchAll(
		/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g,
	)) {
		const target = match[1];
		if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // http:, https:, mailto:
		if (target.startsWith("#")) continue;
		links.push(target.split("#")[0].split("?")[0]);
	}
	return links.filter(Boolean);
}

describe("public documents", () => {
	it("exist at the top level, where GitHub looks for them", () => {
		for (const file of [
			"README.md",
			"LICENSE",
			"CONTRIBUTING.md",
			"SECURITY.md",
			"CODE_OF_CONDUCT.md",
		]) {
			expect(existsSync(path.join(root, file)), file).toBe(true);
		}
	});

	it("only link to files that exist", () => {
		const broken: string[] = [];
		for (const file of markdownFiles()) {
			for (const target of relativeLinks(readFileSync(file, "utf8"))) {
				const resolved = target.startsWith("/")
					? path.join(root, target)
					: path.resolve(path.dirname(file), target);
				if (!existsSync(resolved)) {
					broken.push(`${path.relative(root, file)} -> ${target}`);
				}
			}
		}
		expect(broken).toEqual([]);
	});
});

describe("README", () => {
	const readme = readFileSync(path.join(root, "README.md"), "utf8");

	it("is no longer the starter template", () => {
		for (const phrase of [
			"Welcome to your new TanStack Start app",
			"pnpm dlx",
			"swapi.dev",
			"src/routes/demo",
			"dist/server/index.mjs",
		]) {
			expect(readme, phrase).not.toContain(phrase);
		}
	});

	it("says what Card Ledger is, how it is licensed and where to go next", () => {
		expect(readme).toMatch(/^# Card Ledger/m);
		expect(readme).toContain("AGPL-3.0-only");
		const links = relativeLinks(readme).map((link) =>
			link.replace(/^\.\//, ""),
		);
		for (const target of [
			"docs/self-hosting.md",
			"docs/backup-restore.md",
			"docs/architecture.md",
			"docs/roadmap.md",
			"CONTRIBUTING.md",
			"SECURITY.md",
			"CODE_OF_CONDUCT.md",
			"LICENSE",
		]) {
			expect(links, target).toContain(target);
		}
	});

	it("gives every image alt text and points it at an existing file", () => {
		const markdownImages = [
			...readme.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g),
		].map(([, alt, target]) => [alt, target] as const);
		const htmlImages = [
			...readme.matchAll(/<img\s[^>]*src="([^"]+)"[^>]*alt="([^"]*)"/g),
		].map(([, target, alt]) => [alt, target] as const);
		const images = [...markdownImages, ...htmlImages];
		expect(images.length).toBeGreaterThan(4);
		for (const [alt, target] of images) {
			expect(alt.trim().length, `alt text for ${target}`).toBeGreaterThan(0);
			expect(existsSync(path.join(root, target)), target).toBe(true);
		}
	});
});

describe("package.json", () => {
	const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

	it("describes the project and points at the repository", () => {
		expect(pkg.description).toMatch(/\S/);
		expect(pkg.repository.url).toContain("github.com/haruBlank0-0/card-ledger");
		expect(pkg.bugs.url).toContain("github.com/haruBlank0-0/card-ledger");
		expect(pkg.license).toBe("AGPL-3.0-only");
	});

	it("keeps no scaffold script that calls an external service", () => {
		expect(pkg.scripts["post-cta-init"]).toBeUndefined();
		for (const [name, command] of Object.entries<string>(pkg.scripts)) {
			expect(command, name).not.toMatch(/npx -y|create-db/);
		}
	});
});
