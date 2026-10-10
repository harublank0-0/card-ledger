import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/export/json")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const { exportDeps } = await import(
					"#/features/export/export.deps.server"
				);
				const { handleExportRequest } = await import(
					"#/features/export/export.handler.server"
				);
				return handleExportRequest(
					request,
					{ type: "json" },
					await exportDeps(),
				);
			},
		},
	},
});
