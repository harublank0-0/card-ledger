import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

function projectName(text: string): string | null {
	return text.match(/^name:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m)?.[1] ?? null;
}

describe("compose project names", () => {
	it("self-hosting does not share a project with the development stack", () => {
		// compose.dev.yaml has no `name:`, so Compose names its project after the checkout
		// directory. Both files define a `db` service: sharing a project would let one stack
		// recreate the other's database container.
		const selfHost = projectName(read("compose.yaml"));
		expect(selfHost).not.toBeNull();
		expect(projectName(read("compose.dev.yaml"))).toBeNull();
		expect(selfHost).not.toBe(path.basename(root));
		expect(selfHost).not.toBe("card-ledger");
	});
});

describe("the database health check", () => {
	// Without -h, pg_isready asks over the Unix socket, which the official image's temporary
	// initialisation server also serves before the real server (the only one listening on
	// TCP) is up. Measured on a fresh volume: ready over the socket ~0.35s before TCP worked.
	// `migrate` connects over TCP, so a socket-only check can send it into a refused
	// connection on first start.
	for (const file of ["compose.yaml", "compose.dev.yaml"]) {
		it(`${file} checks readiness over TCP, as dependants connect`, () => {
			const check = read(file)
				.split("\n")
				.find((line) => line.includes("pg_isready"));
			expect(check, file).toBeDefined();
			expect(check, file).toMatch(
				/pg_isready\s+-h\s+(127\.0\.0\.1|localhost)\b/,
			);
		});
	}
});
