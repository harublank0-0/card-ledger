import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/export/csv/$entity")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const { exportDeps } = await import(
					"#/features/export/export.deps.server"
				);
				const { handleExportRequest } = await import(
					"#/features/export/export.handler.server"
				);
				return handleExportRequest(
					request,
					{ type: "csv", entity: params.entity },
					await exportDeps(),
				);
			},
		},
	},
});
