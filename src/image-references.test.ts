import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Docker refuses an image name with an uppercase letter ("repository name must be lowercase"),
// but GitHub shows the account as haruBlank0-0. The first documents told people to set
// CARD_LEDGER_IMAGE=ghcr.io/haruBlank0-0/card-ledger:0.1.1, which cannot work: the first person to
// follow them found out within minutes. Every registry reference in the repository must be
// something `docker pull` accepts. (Web URLs such as github.com/haruBlank0-0/... are
// case-insensitive and are not registry references.)
const root = process.cwd();
const SELF = "src/image-references.test.ts";
const SKIP = new Set([SELF, "pnpm-lock.yaml"]);

function trackedTextFiles(): string[] {
	const listed = spawnSync("git", ["ls-files", "-z"], {
		cwd: root,
		encoding: "utf8",
	});
	expect(listed.status, "git ls-files").toBe(0);
	return listed.stdout
		.split("\0")
		.filter((file) => file && !SKIP.has(file))
		.filter((file) => !/\.(png|jpe?g|gif|ico|woff2?|ttf|webp)$/i.test(file));
}

describe("registry references", () => {
	it("are lowercase everywhere in the repository, because Docker rejects anything else", () => {
		const offenders: string[] = [];
		for (const file of trackedTextFiles()) {
			const text = readFileSync(path.join(root, file));
			if (text.includes(0)) continue; // binary
			const source = text.toString("utf8");
			for (const match of source.matchAll(/ghcr\.io\/[A-Za-z0-9._/-]+/g)) {
				if (match[0] !== match[0].toLowerCase()) {
					offenders.push(`${file}: ${match[0]}`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});

	it("exist at least once, so this check cannot pass by looking at nothing", () => {
		let seen = 0;
		for (const file of trackedTextFiles()) {
			const text = readFileSync(path.join(root, file), "utf8");
			seen += (text.match(/ghcr\.io\/[a-z0-9._/-]+/g) ?? []).length;
		}
		expect(seen).toBeGreaterThan(5);
	});
});
