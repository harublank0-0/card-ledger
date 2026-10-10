/**
 * Check that every installed production dependency has a licence compatible with
 * AGPL-3.0-only, using the allowlist in scripts/license-policy.ts.
 *
 *   npm run licenses:check
 *
 * Exits 1 if any package has a forbidden or unreviewed licence. It reads `node_modules`, so
 * run `npm ci` first. It makes no network calls.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import {
	evaluatePackage,
	type Finding,
	type PackageLicense,
} from "./license-policy";

function productionPackagePaths(): string[] {
	let stdout = "";
	try {
		stdout = execFileSync("npm", ["ls", "--omit=dev", "--all", "--parseable"], {
			encoding: "utf8",
			maxBuffer: 64 * 1024 * 1024,
			stdio: ["ignore", "pipe", "ignore"],
		});
	} catch (error) {
		// `npm ls` exits non-zero for things like optional platform packages that are not
		// installed; what it printed is still the tree we want.
		stdout = (error as { stdout?: string }).stdout ?? "";
	}
	return [
		...new Set(
			stdout
				.split("\n")
				.map((line) => line.trim())
				.filter(Boolean),
		),
	];
}

function readLicense(manifest: Record<string, unknown>): string | null {
	const license = manifest.license;
	if (typeof license === "string") return license;
	if (license && typeof license === "object") {
		const type = (license as { type?: unknown }).type;
		if (typeof type === "string") return type;
	}
	const legacy = manifest.licenses;
	if (Array.isArray(legacy)) {
		const types = legacy
			.map((entry) =>
				typeof entry === "string" ? entry : (entry as { type?: unknown })?.type,
			)
			.filter((type): type is string => typeof type === "string");
		if (types.length > 0) return types.join(" OR ");
	}
	return null;
}

function main() {
	const root = process.cwd();
	const seen = new Map<string, PackageLicense>();

	for (const directory of productionPackagePaths()) {
		if (path.resolve(directory) === root) continue;
		const manifestPath = path.join(directory, "package.json");
		if (!existsSync(manifestPath)) continue;
		const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
			string,
			unknown
		>;
		const name = typeof manifest.name === "string" ? manifest.name : null;
		if (!name) continue;
		const version =
			typeof manifest.version === "string" ? manifest.version : "?";
		seen.set(`${name}@${version}`, {
			name,
			version,
			license: readLicense(manifest),
		});
	}

	if (seen.size === 0) {
		console.error(
			"No installed production dependencies found. Run `npm ci` first.",
		);
		process.exit(1);
	}

	const findings: Finding[] = [...seen.values()]
		.map((pkg) => evaluatePackage(pkg))
		.sort((a, b) => a.name.localeCompare(b.name));

	const counts = new Map<string, number>();
	for (const finding of findings) {
		counts.set(finding.license, (counts.get(finding.license) ?? 0) + 1);
	}
	const failing = findings.filter((finding) => finding.status === "fail");
	const exceptions = findings.filter(
		(finding) => finding.status === "exception",
	);

	console.log(`Production dependency licences: ${findings.length} packages`);
	for (const [license, count] of [...counts].sort((a, b) => b[1] - a[1])) {
		console.log(`  ${String(count).padStart(5)}  ${license}`);
	}
	if (exceptions.length > 0) {
		console.log("\nReviewed exceptions:");
		for (const finding of exceptions) {
			console.log(
				`  exception  ${finding.name}@${finding.version}  [${finding.license}]\n             ${finding.reason}`,
			);
		}
	}
	if (failing.length > 0) {
		console.log("\nFailing:");
		for (const finding of failing) {
			console.log(
				`  FAIL  ${finding.name}@${finding.version}  [${finding.license}]  ${finding.reason}`,
			);
		}
	}
	console.log(`\n${failing.length} failing`);
	process.exit(failing.length > 0 ? 1 : 0);
}

main();
