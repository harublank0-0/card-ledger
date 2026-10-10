import { createFileRoute } from "@tanstack/react-router";
import { auth } from "#/lib/auth";
import { handleAuthPost } from "#/lib/auth-guards";

export const Route = createFileRoute("/api/auth/$")({
	server: {
		handlers: {
			GET: ({ request }) => auth.handler(request),
			POST: ({ request }) => handleAuthPost(request, auth.handler),
		},
	},
});
