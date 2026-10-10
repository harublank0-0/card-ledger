import { describeEnvProblems, parseServerEnv } from "#/env.schema";

import type { LogFields } from "./logger.server";

type Log = {
	info: (msg: string, fields?: LogFields) => void;
	error: (msg: string, fields?: LogFields) => void;
};

/**
 * Validate the environment once at boot and say plainly what is wrong, instead of failing
 * with a stack trace on the first request. Logs variable names and the violated rule, never a
 * value. In production an invalid environment ends the process so the orchestrator shows a
 * failed container; elsewhere it only reports, leaving the dev server usable.
 */
export function checkStartupEnv(
	source: Record<string, string | undefined>,
	deps: { log: Log; exit: (code: number) => void; production: boolean },
): boolean {
	const problems = describeEnvProblems(source);
	const parsed = parseServerEnv(source);

	if (problems.length > 0 || !parsed.success) {
		for (const problem of problems) {
			deps.log.error("invalid environment variable", {
				variable: problem.name,
				problem: problem.problem,
			});
		}
		deps.log.error("invalid configuration, refusing to start");
		if (deps.production) deps.exit(1);
		return false;
	}

	deps.log.info("configuration valid", {
		signupMode: parsed.data.SIGNUP_MODE,
		smtp: Boolean(parsed.data.SMTP_HOST),
		mcpEnabled: parsed.data.MCP_ENABLED,
	});
	return true;
}
