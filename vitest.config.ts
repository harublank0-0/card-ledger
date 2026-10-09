import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: { tsconfigPaths: true },
	test: {
		include: ["src/**/*.test.ts"],
		environment: "node",
		globalSetup: ["./src/test/global-setup.ts"],
		// Integration tests share one database, so run files one at a time.
		fileParallelism: false,
	},
});
