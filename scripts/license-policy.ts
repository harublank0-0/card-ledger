/**
 * Which dependency licences may ship with Card Ledger (AGPL-3.0-only).
 *
 * Pure and dependency-free so it can be unit tested; `scripts/check-licenses.ts` applies it to
 * the installed production dependency tree. The policy is an allowlist: a licence that is not
 * recognised fails the check until someone reviews it and either extends the list here or
 * records a documented exception.
 */

export type Verdict = "allowed" | "forbidden" | "unknown";

/** Permissive licences, weak copyleft (MPL-2.0 is explicitly AGPL-compatible) and GPLv3-family. */
const ALLOWED = new Set([
	"mit",
	"mit-0",
	"isc",
	"bsd-2-clause",
	"bsd-3-clause",
	"0bsd",
	"apache-2.0",
	"unlicense",
	"cc0-1.0",
	"cc-by-4.0",
	"python-2.0",
	"blueoak-1.0.0",
	"zlib",
	"mpl-2.0",
	"agpl-3.0-only",
	"agpl-3.0-or-later",
	"gpl-3.0-only",
	"gpl-3.0-or-later",
	"gpl-2.0-or-later",
	"lgpl-3.0-only",
	"lgpl-3.0-or-later",
	"lgpl-2.1-only",
	"lgpl-2.1-or-later",
]);

/** Licences that cannot be combined with AGPL-3.0-only, or that restrict use. */
const FORBIDDEN = new Set([
	"gpl-2.0-only",
	"gpl-2.0",
	"gpl-1.0-only",
	"gpl-1.0",
	"agpl-1.0",
	"sspl-1.0",
	"busl-1.1",
	"elastic-2.0",
	"commons-clause",
	"unlicensed",
	"proprietary",
]);
const FORBIDDEN_PREFIXES = ["cc-by-nc", "cc-by-nd"];

function classifyIdentifier(identifier: string): Verdict {
	const id = identifier.trim().toLowerCase();
	if (!id) return "unknown";
	if (ALLOWED.has(id)) return "allowed";
	if (FORBIDDEN.has(id)) return "forbidden";
	if (FORBIDDEN_PREFIXES.some((prefix) => id.startsWith(prefix))) {
		return "forbidden";
	}
	return "unknown";
}

const RANK: Record<Verdict, number> = { forbidden: 0, unknown: 1, allowed: 2 };
const best = (a: Verdict, b: Verdict): Verdict => (RANK[a] >= RANK[b] ? a : b);
const worst = (a: Verdict, b: Verdict): Verdict => (RANK[a] <= RANK[b] ? a : b);

/**
 * Classify an SPDX licence expression such as `MIT`, `(MIT OR Apache-2.0)` or `MIT AND ISC`.
 * `OR` lets the consumer choose the best alternative; `AND` requires every part to be
 * acceptable; `AND` binds tighter than `OR`. Anything it cannot parse is `unknown`.
 */
export function classifyLicense(
	expression: string | null | undefined,
): Verdict {
	const text = (expression ?? "").trim();
	if (!text) return "unknown";

	const tokens = text.match(/\(|\)|[^\s()]+/g) ?? [];
	let position = 0;
	let failed = false;

	const isOperator = (token: string | undefined, word: "and" | "or") =>
		token !== undefined && token.toLowerCase() === word;

	function parseOr(): Verdict {
		let verdict = parseAnd();
		while (isOperator(tokens[position], "or")) {
			position++;
			verdict = best(verdict, parseAnd());
		}
		return verdict;
	}

	function parseAnd(): Verdict {
		let verdict = parseAtom();
		while (isOperator(tokens[position], "and")) {
			position++;
			verdict = worst(verdict, parseAtom());
		}
		return verdict;
	}

	function parseAtom(): Verdict {
		const token = tokens[position];
		if (token === "(") {
			position++;
			const inner = parseOr();
			if (tokens[position] !== ")") failed = true;
			else position++;
			return inner;
		}
		const words: string[] = [];
		while (
			position < tokens.length &&
			tokens[position] !== "(" &&
			tokens[position] !== ")" &&
			!isOperator(tokens[position], "and") &&
			!isOperator(tokens[position], "or")
		) {
			words.push(tokens[position]);
			position++;
		}
		if (words.length === 0) {
			failed = true;
			return "unknown";
		}
		return classifyIdentifier(words.join(" "));
	}

	const verdict = parseOr();
	if (failed || position !== tokens.length) return "unknown";
	return verdict;
}

export type PackageLicense = {
	name: string;
	version: string;
	license: string | null;
};

export type Finding = {
	name: string;
	version: string;
	license: string;
	status: "ok" | "exception" | "fail";
	reason?: string;
};

/**
 * Reviewed exceptions, by package name. They apply only to licences that are *undecided*; a
 * forbidden licence can never be excused. Keep this list short and every reason specific.
 */
export const EXCEPTIONS: Record<string, string> = {
	"seq-queue":
		"MIT: the package ships an MIT LICENSE file but omits the licence field. It is pulled in by better-auth through mysql2, which Card Ledger does not use (it runs on PostgreSQL).",
	elkjs:
		"EPL-2.0: a dependency of the Prisma CLI's Studio. It is installed in the image's node_modules but never bundled with or linked into the application, so it is aggregation, not a combined work.",
};

export function evaluatePackage(
	pkg: PackageLicense,
	exceptions: Record<string, string> = EXCEPTIONS,
): Finding {
	const license = pkg.license?.trim() ?? "";
	const base = {
		name: pkg.name,
		version: pkg.version,
		license: license || "UNKNOWN",
	};
	const verdict = classifyLicense(license);

	if (verdict === "allowed") return { ...base, status: "ok" };
	if (verdict === "forbidden") {
		return {
			...base,
			status: "fail",
			reason: "licence is not compatible with AGPL-3.0-only",
		};
	}
	const note = exceptions[pkg.name];
	if (note) return { ...base, status: "exception", reason: note };
	return {
		...base,
		status: "fail",
		reason: license
			? "licence is not on the allowlist: review it, then extend the policy or document an exception"
			: "no licence declared",
	};
}
