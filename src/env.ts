import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import { serverEnvSchema } from "./env.schema";

export const env = createEnv({
	server: serverEnvSchema,

	/** Client-side variables must carry this prefix (enforced by type and at runtime). */
	clientPrefix: "VITE_",

	client: {
		VITE_APP_TITLE: z.string().min(1).default("Card Ledger"),
	},

	// Server variables live in process.env; VITE_ variables are inlined into import.meta.env.
	runtimeEnv: {
		...(typeof process !== "undefined" ? process.env : {}),
		...import.meta.env,
	},

	// Treat `FOO=` as unset so defaults apply.
	emptyStringAsUndefined: true,
});
