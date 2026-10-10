import { env } from "#/env";
import { auth } from "#/lib/auth";

import type { handleExportRequest } from "./export.handler.server";

type Deps = Parameters<typeof handleExportRequest>[2];

/** Wires the export handler to the real session lookup and instance defaults. */
export async function exportDeps(): Promise<Deps> {
	return {
		getUserId: async (request) => {
			const session = await auth.api.getSession({ headers: request.headers });
			return session?.user.id ?? null;
		},
		defaultTimezone: env.DEFAULT_TIMEZONE,
	};
}
