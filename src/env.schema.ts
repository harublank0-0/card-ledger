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
