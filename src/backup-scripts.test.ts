import { spawnSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

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

// The real scripts/backup.sh, run against a fake `docker` so retention can be exercised
// without containers: `pg_dump` prints a few bytes, `pg_restore` reads and accepts stdin.
describe("scripts/backup.sh retention", () => {
	const scratch = mkdtempSync(path.join(tmpdir(), "card-ledger-backup-"));
	afterAll(() => rmSync(scratch, { recursive: true, force: true }));

	const bin = path.join(scratch, "bin");
	mkdirSync(bin);
	writeFileSync(
		path.join(bin, "docker"),
		`#!/bin/sh
case "$*" in
	*pg_dump*) printf 'PGDMP-fake-dump'; exit 0 ;;
	*pg_restore*) cat >/dev/null; exit 0 ;;
esac
exit 0
`,
	);
	chmodSync(path.join(bin, "docker"), 0o755);

	let counter = 0;
	function backupDir(existing: string[]) {
		const dir = path.join(scratch, `dir-${++counter}`);
		mkdirSync(dir);
		for (const name of existing) writeFileSync(path.join(dir, name), "old");
		return dir;
	}
	const old = (n: number) =>
		`card-ledger-20260101T0000${String(n).padStart(2, "0")}Z-01.dump`;
	function run(dir: string, keep: string) {
		const result = spawnSync(
			"sh",
			[path.join(process.cwd(), "scripts", "backup.sh")],
			{
				env: {
					...process.env,
					PATH: `${bin}:${process.env.PATH}`,
					BACKUP_DIR: dir,
					BACKUP_KEEP: keep,
				},
				encoding: "utf8",
			},
		);
		return {
			status: result.status,
			output: `${result.stdout}${result.stderr}`,
			files: readdirSync(dir).filter((f) => f.endsWith(".dump")),
		};
	}

	it.each([
		"0",
		"00",
		"000",
		"abc",
		"-1",
		"1.5",
		"",
	])("rejects BACKUP_KEEP=%j without deleting anything", (keep) => {
		const existing = [old(1), old(2), old(3)];
		const dir = backupDir(existing);
		// An empty value falls back to the default (14) rather than being rejected.
		const result = run(dir, keep);
		if (keep === "") {
			expect(result.status).toBe(0);
			return;
		}
		expect(result.status).toBe(2);
		expect(result.output).toContain("BACKUP_KEEP");
		expect(result.files.sort()).toEqual(existing.sort());
	});

	it("reads a number with a leading zero as decimal, not octal", () => {
		// `$((13 - 010))` is 5 in shell arithmetic (010 is octal 8): 8 of 13 would survive.
		const dir = backupDir(Array.from({ length: 12 }, (_, i) => old(i + 1)));
		const result = run(dir, "010");
		expect(result.status).toBe(0);
		expect(result.files).toHaveLength(10);
	});

	it("accepts 08 and 09, which are not valid octal", () => {
		const dir = backupDir([old(1), old(2), old(3)]);
		const result = run(dir, "08");
		expect(result.status).toBe(0);
		expect(result.files).toHaveLength(4);
	});

	it("keeps the newest N and removes the rest", () => {
		const dir = backupDir(Array.from({ length: 5 }, (_, i) => old(i + 1)));
		const result = run(dir, "3");
		expect(result.status).toBe(0);
		expect(result.files).toHaveLength(3);
		expect(result.files).not.toContain(old(1));
		expect(result.files).not.toContain(old(2));
	});

	it("never deletes the backup it has just written", () => {
		// A file whose name sorts after any new one (clock skew, a copy from another host).
		const future = "card-ledger-29990101T000000Z-01.dump";
		const dir = backupDir([future]);
		const result = run(dir, "1");
		expect(result.status).toBe(0);
		const written = result.output.match(/backup written: (\S+)/)?.[1] ?? "";
		expect(existsSync(written), written).toBe(true);
	});
});

describe("scripts/restore.sh ordering and recovery", () => {
	const code = read("restore.sh")
		.split("\n")
		.filter((line) => !line.trim().startsWith("#"))
		.join("\n");
	const at = (needle: string) => code.indexOf(needle);

	it("stops the app and reminders before it takes the safety backup", () => {
		// Writes made between the dump and the stop would otherwise be in neither copy.
		expect(at("docker compose stop app reminders")).toBeGreaterThan(-1);
		expect(at("scripts/backup.sh")).toBeGreaterThan(-1);
		expect(at("docker compose stop app reminders")).toBeLessThan(
			at("scripts/backup.sh"),
		);
	});

	it("only stops them after deciding to proceed, so a refusal leaves the app running", () => {
		expect(at("already contains")).toBeGreaterThan(-1);
		expect(at("already contains")).toBeLessThan(
			at("docker compose stop app reminders"),
		);
	});

	it("tells the operator how to recover if it dies after dropping the database", () => {
		expect(code).toMatch(/trap\s+\S+\s+EXIT/);
		expect(code).toMatch(/INTERRUPTED/);
	});

	it("treats a missing database as empty instead of failing to connect to it", () => {
		expect(code).toMatch(/pg_database/);
	});
});
