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
		"CHANGELOG.md",
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

describe("destructive commands in the operator guides", () => {
	const guide = readFileSync(
		path.join(root, "docs", "backup-restore.md"),
		"utf8",
	);

	it("never remove volumes without naming the compose project", () => {
		// An exported COMPOSE_PROJECT_NAME is lost in a new terminal or under sudo, and
		// `name:` in compose.yaml then points at the live stack. `down -v` must say -p.
		const risky = guide
			.split("\n")
			.filter((line) => /\bdown\b.*(-v\b|--volumes)/.test(line))
			.filter((line) => !/\s(-p|--project-name)[\s=]/.test(line));
		expect(risky).toEqual([]);
	});

	it("does not tell the reader to try a restored copy with the live SMTP settings", () => {
		// Starting the whole stack from a restored backup would email real users from it.
		expect(guide).not.toMatch(/restore\.sh[^\n]*\n[^\n]*localhost:3199/);
		expect(guide).toContain("scripts/restore-test.sh");
	});
});

describe("scripts/restore-test.sh", () => {
	const script = readFileSync(
		path.join(root, "scripts", "restore-test.sh"),
		"utf8",
	);

	it("names its compose project on every compose command", () => {
		expect(script).toMatch(/compose\(\) \{ docker compose -p "\$PROJECT"/);
		const bare = script
			.split("\n")
			.filter((line) => /^\s*docker compose\b/.test(line))
			.filter(
				(line) => !/^\s*docker compose\s+(-p|--project-name)\b/.test(line),
			);
		expect(bare).toEqual([]);
	});

	it("uses a unique project name so it cannot collide with the live stack", () => {
		expect(script).toMatch(/PROJECT="card-ledger-restore-test-/);
		expect(script).not.toContain("card-ledger-selfhost");
	});

	it("switches reminder emails off and verifies it", () => {
		expect(script).toMatch(/SMTP_HOST=""/);
		expect(script).toContain("reminders disabled");
	});
});

describe("sign-up policy and reminder email in the operator guide", () => {
	const guide = readFileSync(
		path.join(root, "docs", "self-hosting.md"),
		"utf8",
	);
	const section = (from: string, to: string) => {
		const start = guide.indexOf(from);
		const end = guide.indexOf(to, start + from.length);
		expect(start, `${from} heading`).toBeGreaterThanOrEqual(0);
		expect(end, `${to} heading`).toBeGreaterThan(start);
		return guide.slice(start, end);
	};

	it("says that open sign-up with SMTP lets anyone have reminders sent to any address", () => {
		const firstUser = section("## First user", "## Email reminders");
		expect(firstUser).toContain("SIGNUP_MODE=open");
		expect(firstUser).toMatch(/not verif/i);
		expect(firstUser).toContain("SMTP");
		expect(firstUser).toMatch(/any (email )?address/i);
		expect(firstUser).toMatch(/`first-user`.*`closed`|`closed`.*`first-user`/s);
	});

	it("points the reminders section at that warning", () => {
		const reminders = section(
			"## Email reminders",
			"## Reaching it from other devices",
		);
		expect(reminders).toContain("SIGNUP_MODE=open");
		expect(reminders).toContain("#first-user");
	});

	it("explains the start-up warning in the troubleshooting table", () => {
		const start = guide.indexOf("## Troubleshooting");
		expect(start, "Troubleshooting heading").toBeGreaterThanOrEqual(0);
		const row = guide
			.slice(start)
			.split("\n")
			.find((line) => line.startsWith("|") && /warning/i.test(line));
		expect(row, "a row about the start-up warning").toBeDefined();
		expect(row).toContain("SIGNUP_MODE=open");
		expect(row).toContain("SMTP");
	});

	it("repeats the warning where the setting is chosen (.env.example)", () => {
		const example = readFileSync(path.join(root, ".env.example"), "utf8");
		const comment = example.split("SIGNUP_MODE=")[0]?.split("\n").slice(-4);
		expect(comment?.join("\n")).toMatch(/not verified|unverified/i);
	});
});
