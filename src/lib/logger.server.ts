/**
 * Structured logs: one JSON object per line on stdout/stderr, for container log collectors.
 *
 * Only primitive field values are ever written, and callers pass constants and counts, not
 * user content. Never log amounts, notes, descriptions, e-mail addresses or error messages
 * (they can carry connection strings or card data); use `errorClass` for failures.
 */
export type LogLevel = "info" | "warn" | "error";
export type LogFields = Record<string, string | number | boolean | null>;

const RESERVED = new Set(["time", "level", "msg"]);

/** Pure formatter, separate from the write so it can be tested. */
export function formatLogLine(
	level: LogLevel,
	msg: string,
	fields: LogFields = {},
	now: Date = new Date(),
): string {
	const entry: Record<string, string | number | boolean | null> = {
		time: now.toISOString(),
		level,
		msg,
	};
	for (const [key, value] of Object.entries(fields)) {
		if (RESERVED.has(key)) continue;
		const type = typeof value;
		if (
			value === null ||
			type === "string" ||
			type === "number" ||
			type === "boolean"
		) {
			entry[key] = value;
		}
	}
	return JSON.stringify(entry);
}

/** The class name of a thrown value. Deliberately never its message. */
export function errorClass(error: unknown): string {
	if (error instanceof Error) return error.constructor.name || "Error";
	return "UnknownError";
}

function write(level: LogLevel, msg: string, fields?: LogFields) {
	const line = formatLogLine(level, msg, fields);
	if (level === "error") console.error(line);
	else console.log(line);
}

export const logger = {
	info: (msg: string, fields?: LogFields) => write("info", msg, fields),
	warn: (msg: string, fields?: LogFields) => write("warn", msg, fields),
	error: (msg: string, fields?: LogFields) => write("error", msg, fields),
};
