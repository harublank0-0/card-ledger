import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) =>
	readFileSync(path.join(process.cwd(), "scripts", file), "utf8");

// `pg_restore --list` reads only the table of contents and accepts an archive that lost its
// last bytes (an interrupted copy). Both scripts must read the archive in full instead. The
// behavioural proof for restore.sh is the "truncated backup" step of scripts/restore-drill.sh;
// a truncated pg_dump cannot be produced on demand, so backup.sh is guarded here.
describe("backup and restore read the whole archive", () => {
	for (const script of ["backup.sh", "restore.sh"]) {
		it(`${script} validates with a full read, not just the table of contents`, () => {
			const code = read(script)
				.split("\n")
				.filter((line) => !line.trim().startsWith("#"))
				.join("\n");
			expect(code).toMatch(/pg_restore -f \/dev\/null/);
			expect(code).not.toMatch(/pg_restore --list/);
		});
	}
});
