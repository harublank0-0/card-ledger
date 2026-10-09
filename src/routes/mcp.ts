import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createFileRoute } from "@tanstack/react-router";

import { env } from "#/env";
import { auth } from "#/lib/auth";
import { handleMcpRequest } from "#/utils/mcp-handler";

// No tools are registered yet. Add tools only for explicitly approved features,
// and scope every tool to the authenticated user.
const server = new McpServer({
	name: "card-ledger",
	version: "1.0.0",
});

export const Route = createFileRoute("/mcp")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				// Disabled by default: the endpoint does not exist unless the operator opts in.
				if (!env.MCP_ENABLED) {
					return new Response("Not found", { status: 404 });
				}
				const session = await auth.api.getSession({ headers: request.headers });
				if (!session) {
					return new Response("Unauthorized", { status: 401 });
				}
				return handleMcpRequest(request, server);
			},
		},
	},
});
