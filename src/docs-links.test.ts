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
