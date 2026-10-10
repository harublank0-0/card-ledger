import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";

import {
	createUserWithPassword,
	deleteTestUsers,
	signInHeaders,
} from "#/test/helpers";

type Handler = (context: { request: Request }) => Promise<Response>;

/**
 * Load the real /mcp route module with a given MCP_ENABLED. `env` is read when the module is
 * first imported, so each configuration needs a fresh module graph.
 */
async function mcpPost(enabled: boolean | undefined, init: RequestInit = {}) {
	vi.resetModules();
	if (enabled === undefined) delete process.env.MCP_ENABLED;
	else process.env.MCP_ENABLED = String(enabled);

	const module = await import("#/routes/mcp");
	const handler = (
		module.Route as unknown as {
			options: { server: { handlers: { POST: Handler } } };
		}
	).options.server.handlers.POST;

	return handler({
		request: new Request("http://localhost/mcp", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: {
					protocolVersion: "2024-11-05",
					capabilities: {},
					clientInfo: { name: "test", version: "1" },
				},
			}),
			...init,
		}),
	});
}

const original = process.env.MCP_ENABLED;
let user: { id: string; email: string };
let password: string;

beforeAll(async () => {
	const made = await createUserWithPassword();
	user = made.user;
	password = made.password;
});
afterAll(async () => {
	await deleteTestUsers([user.id]);
});
afterEach(() => {
	if (original === undefined) delete process.env.MCP_ENABLED;
	else process.env.MCP_ENABLED = original;
	vi.resetModules();
});

describe("the /mcp endpoint is private by default", () => {
	it("does not exist when MCP_ENABLED is unset", async () => {
		const response = await mcpPost(undefined);
		expect(response.status).toBe(404);
	});

	it("does not exist when MCP_ENABLED is false, even for a signed-in user", async () => {
		const headers = await signInHeaders(user.email, password);
		const response = await mcpPost(false, {
			headers: {
				...Object.fromEntries(headers),
				"Content-Type": "application/json",
			},
		});
		expect(response.status).toBe(404);
	});

	it("still requires a session when the operator enables it", async () => {
		const response = await mcpPost(true);
		expect(response.status).toBe(401);
	});

	it("serves a signed-in user once enabled", async () => {
		const headers = await signInHeaders(user.email, password);
		const response = await mcpPost(true, {
			headers: {
				...Object.fromEntries(headers),
				"Content-Type": "application/json",
			},
		});
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.result?.serverInfo?.name).toBe("card-ledger");
	});
});
