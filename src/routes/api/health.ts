import { createFileRoute } from "@tanstack/react-router";

// Unauthenticated on purpose: Docker, reverse proxies and uptime checks call this without a
// session. It touches no domain table and reveals only pass/fail per check.
async function probe(request: Request) {
	const { handleHealthRequest } = await import(
		"#/features/health/health.handler.server"
	);
	const { checkHealth } = await import(
		"#/features/health/health.service.server"
	);
	const { errorClass, logger } = await import("#/lib/logger.server");

	return handleHealthRequest(request, {
		check: async () => {
			const result = await checkHealth();
			if (!result.ok) {
				logger.warn("health check failing", {
					database: result.checks.database,
					migrations: result.checks.migrations,
				});
			}
			return result;
		},
		onError: (error) =>
			logger.error("health check crashed", { error: errorClass(error) }),
	});
}

export const Route = createFileRoute("/api/health")({
	server: {
		handlers: {
			GET: ({ request }) => probe(request),
			HEAD: ({ request }) => probe(request),
		},
	},
});
