import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// scripts/build-image.sh is the one place that says how a published image is built and labelled.
// The image-check and publish workflows both call it, so a test here covers both.
const root = process.cwd();
const script = path.join(root, "scripts", "build-image.sh");
const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function run(args: string[], env: Record<string, string> = {}, cwd = root) {
	const bin = mkdtempSync(path.join(tmpdir(), "fake-docker-"));
	dirs.push(bin);
	const log = path.join(bin, "calls.log");
	const docker = path.join(bin, "docker");
	writeFileSync(docker, `#!/bin/sh\nprintf '%s\\n' "$*" >> "${log}"\n`);
	chmodSync(docker, 0o755);
	const result = spawnSync("sh", [script, ...args], {
		cwd,
		encoding: "utf8",
		timeout: 30_000,
		env: {
			...process.env,
			PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
			IMAGE_VERSION: "",
			IMAGE_REVISION: "",
			IMAGE_SOURCE: "",
			...env,
		},
	});
	let calls: string[] = [];
	try {
		calls = readFileSync(log, "utf8").split("\n").filter(Boolean);
	} catch {
		// no docker call was made
	}
	return {
		status: result.status,
		output: `${result.stdout}${result.stderr}`,
		calls,
	};
}

describe("scripts/build-image.sh", () => {
	it("needs an image reference", () => {
		const result = run([]);
		expect(result.status).not.toBe(0);
		expect(result.output).toMatch(/usage/i);
		expect(result.calls).toEqual([]);
	});

	it("builds the repository root with the given tag and fresh base layers", () => {
		const result = run(["ghcr.io/example/card-ledger:1.2.3-amd64"], {
			IMAGE_VERSION: "1.2.3",
			IMAGE_REVISION: "0123456789abcdef0123456789abcdef01234567",
		});
		expect(result.status).toBe(0);
		expect(result.calls).toHaveLength(1);
		const call = result.calls[0] ?? "";
		expect(call).toMatch(/^build /);
		expect(call).toContain("--pull");
		expect(call).toContain("--tag ghcr.io/example/card-ledger:1.2.3-amd64");
		expect(call).toMatch(/ \.$/); // the context is the repository root
	});

	it("labels the image with its source, revision, version and licence", () => {
		const { calls } = run(["example/card-ledger:1.2.3"], {
			IMAGE_VERSION: "1.2.3",
			IMAGE_REVISION: "0123456789abcdef0123456789abcdef01234567",
		});
		const call = calls[0] ?? "";
		expect(call).toContain(
			"org.opencontainers.image.source=https://github.com/haruBlank0-0/card-ledger",
		);
		expect(call).toContain(
			"org.opencontainers.image.revision=0123456789abcdef0123456789abcdef01234567",
		);
		expect(call).toContain("org.opencontainers.image.version=1.2.3");
		expect(call).toContain("org.opencontainers.image.licenses=AGPL-3.0-only");
		expect(call).toContain("org.opencontainers.image.title=Card Ledger");
	});

	it("takes the revision from git when none is given, and never writes an empty label", () => {
		const { calls } = run(["example/card-ledger:dev"]);
		const call = calls[0] ?? "";
		expect(call).toMatch(/org\.opencontainers\.image\.revision=[0-9a-f]{40}/);
		expect(call).not.toMatch(/image\.(revision|version|source)= /);
		expect(call).toContain("org.opencontainers.image.version=dev");
	});

	it("builds from the repository root whatever directory it is run from", () => {
		const elsewhere = mkdtempSync(path.join(tmpdir(), "elsewhere-"));
		dirs.push(elsewhere);
		const result = run(["example/card-ledger:dev"], {}, elsewhere);
		expect(result.status).toBe(0);
		expect(result.calls).toHaveLength(1);
	});
});
