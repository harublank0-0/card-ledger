import { safeTimeZone, todayIn } from "#/lib/calendar-date";

import {
	type CsvEntity,
	csvForEntity,
	exportFilename,
	isCsvEntity,
} from "./export.logic";
import { buildExport } from "./export.service.server";

/** Never let a browser, proxy or extension keep a copy of someone's financial data. */
const PRIVATE_HEADERS = {
	"Cache-Control": "no-store",
	"X-Content-Type-Options": "nosniff",
} as const;

export type ExportTarget = { type: "json" } | { type: "csv"; entity: string };

/**
 * Handle one export download. `getUserId` resolves the signed-in user from the request (the
 * server route passes Better Auth; tests pass a fake), returning null when nobody is signed in.
 */
export async function handleExportRequest(
	request: Request,
	target: ExportTarget,
	deps: {
		getUserId: (request: Request) => Promise<string | null>;
		defaultTimezone: string;
		now?: Date;
	},
): Promise<Response> {
	const userId = await deps.getUserId(request);
	if (!userId) {
		return Response.json(
			{ error: "Unauthorized" },
			{ status: 401, headers: PRIVATE_HEADERS },
		);
	}
	if (target.type === "csv" && !isCsvEntity(target.entity)) {
		return Response.json(
			{ error: "Not found" },
			{ status: 404, headers: PRIVATE_HEADERS },
		);
	}

	const now = deps.now ?? new Date();
	const document = await buildExport(userId, now);
	const timezone = safeTimeZone(
		document.settings?.timezone,
		deps.defaultTimezone,
	);
	const date = todayIn(timezone, now);

	if (target.type === "json") {
		return new Response(JSON.stringify(document, null, 2), {
			headers: {
				...PRIVATE_HEADERS,
				"Content-Type": "application/json; charset=utf-8",
				"Content-Disposition": `attachment; filename="${exportFilename("everything", "json", date)}"`,
			},
		});
	}

	const entity = target.entity as CsvEntity;
	// A UTF-8 byte order mark makes Excel read names in any script correctly.
	const body = `﻿${csvForEntity(entity, document)}`;
	return new Response(body, {
		headers: {
			...PRIVATE_HEADERS,
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="${exportFilename(entity, "csv", date)}"`,
		},
	});
}
