/** Identifies the file and its schema. Additive changes keep the version; breaking ones bump it. */
export const EXPORT_FORMAT = "card-ledger-export";
export const EXPORT_VERSION = 1;

/** The CSV downloads, one per table. The URL segment is the key. */
export const CSV_ENTITIES = {
	categories: {
		document: "categories",
		columns: ["id", "name", "archived", "createdAt"],
	},
	cards: {
		document: "cards",
		columns: [
			"id",
			"name",
			"issuer",
			"last4",
			"currency",
			"creditLimitMinor",
			"creditLimit",
			"statementDay",
			"paymentDueDay",
			"archived",
			"createdAt",
		],
	},
	subscriptions: {
		document: "subscriptions",
		columns: [
			"id",
			"name",
			"amountMinor",
			"currency",
			"amount",
			"intervalCount",
			"intervalUnit",
			"anchorDate",
			"status",
			"autoRenew",
			"expiresOn",
			"cancellationDeadline",
			"cancelledOn",
			"cardId",
			"cardName",
			"notes",
			"archived",
			"createdAt",
		],
	},
	transactions: {
		document: "transactions",
		columns: [
			"id",
			"type",
			"occurredOn",
			"description",
			"amountMinor",
			"currency",
			"amount",
			"categoryId",
			"categoryName",
			"cardId",
			"cardName",
			"subscriptionId",
			"subscriptionName",
			"refundOfId",
			"notes",
			"createdAt",
		],
	},
	statements: {
		document: "statements",
		columns: [
			"id",
			"cardId",
			"cardName",
			"periodStart",
			"periodEnd",
			"dueDate",
			"currency",
			"balanceMinor",
			"balance",
			"minimumDueMinor",
			"minimumDue",
			"paidMinor",
			"outstandingMinor",
			"createdAt",
		],
	},
	"statement-payments": {
		document: "statementPayments",
		columns: [
			"id",
			"statementId",
			"paidOn",
			"amountMinor",
			"currency",
			"amount",
			"notes",
			"createdAt",
		],
	},
} as const;

export type CsvEntity = keyof typeof CSV_ENTITIES;

export function isCsvEntity(value: string): value is CsvEntity {
	return Object.hasOwn(CSV_ENTITIES, value);
}

/** Spreadsheets treat a leading = + - @ (or tab / carriage return) as the start of a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

/**
 * One CSV field. Text that could be read as a formula by Excel or Sheets is prefixed with an
 * apostrophe (CSV injection); numbers and booleans are written as they are; the rest follows
 * RFC 4180 quoting.
 */
export function csvCell(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	let text = String(value);
	if (FORMULA_START.test(text)) text = `'${text}`;
	return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** A CSV document: a header line, then one line per row, CRLF separated, ending in CRLF. */
export function toCsv(
	rows: readonly Record<string, unknown>[],
	columns: readonly string[],
): string {
	const lines = [columns.map(csvCell).join(",")];
	for (const row of rows) {
		lines.push(columns.map((column) => csvCell(row[column])).join(","));
	}
	return `${lines.join("\r\n")}\r\n`;
}

/** e.g. card-ledger-transactions-2026-10-10.csv */
export function exportFilename(
	name: string,
	extension: "csv" | "json",
	date: string,
) {
	return `card-ledger-${name}-${date}.${extension}`;
}

/** Render one CSV download from a full export document. */
export function csvForEntity(
	entity: CsvEntity,
	document: Readonly<Record<string, unknown>>,
): string {
	const definition = CSV_ENTITIES[entity];
	const rows = document[definition.document];
	if (!Array.isArray(rows))
		throw new Error(`Export is missing ${definition.document}`);
	return toCsv(rows as Record<string, unknown>[], definition.columns);
}
