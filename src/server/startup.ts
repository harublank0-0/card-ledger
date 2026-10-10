import { definePlugin } from "nitro";

import { logger } from "#/lib/logger.server";
import { checkStartupEnv } from "#/lib/startup-env.server";

// Runs once when the server boots (registered in vite.config.ts). Keeps its logic in
// `checkStartupEnv` so it can be tested without Nitro.
export default definePlugin(() => {
	checkStartupEnv(process.env, {
		log: logger,
		exit: (code) => process.exit(code),
		production: process.env.NODE_ENV === "production",
	});
});
