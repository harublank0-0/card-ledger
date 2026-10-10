import { z } from "zod";

/** Server-only variables. Kept separate from `env.ts` so it can be unit tested. */
export const serverEnvSchema = {
	DATABASE_URL: z.string().min(1),
	BETTER_AUTH_URL: z.url(),
	BETTER_AUTH_SECRET: z
		.string()
		.min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
	/** first-user: only the first account may register. open: anyone. closed: nobody. */
	SIGNUP_MODE: z.enum(["first-user", "open", "closed"]).default("first-user"),
	DEFAULT_TIMEZONE: z.string().min(1).default("Asia/Kathmandu"),
	MCP_ENABLED: z.stringbool().default(false),
	SMTP_HOST: z.string().min(1).optional(),
	SMTP_PORT: z.coerce.number().int().positive().optional(),
	SMTP_USER: z.string().min(1).optional(),
	SMTP_PASSWORD: z.string().min(1).optional(),
	SMTP_FROM: z.string().min(1).optional(),
	SMTP_SECURE: z.stringbool().default(false),
};

export const signupModeSchema = serverEnvSchema.SIGNUP_MODE;
export type SignupMode = z.infer<typeof signupModeSchema>;

export type EnvProblem = { name: string; problem: string };
export type ServerEnv = z.infer<z.ZodObject<typeof serverEnvSchema>>;

/** Parse a set of variables the way `env.ts` does: an empty string counts as unset. */
export function parseServerEnv(source: Record<string, string | undefined>) {
	const cleaned: Record<string, string | undefined> = {};
	for (const [key, value] of Object.entries(source)) {
		cleaned[key] = value === "" ? undefined : value;
	}
	return z.object(serverEnvSchema).safeParse(cleaned);
}

/**
 * Explain what is wrong with a set of environment variables without ever repeating a value
 * (a rejected secret or connection string must not end up in a log).
 */
export function describeEnvProblems(
	source: Record<string, string | undefined>,
): EnvProblem[] {
	const result = parseServerEnv(source);
	if (result.success) return [];

	const byName = new Map<string, string>();
	for (const issue of result.error.issues) {
		const name = String(issue.path[0] ?? "environment");
		if (!byName.has(name)) byName.set(name, issue.message);
	}
	return [...byName.entries()]
		.map(([name, problem]) => ({ name, problem }))
		.sort((a, b) => a.name.localeCompare(b.name));
}
