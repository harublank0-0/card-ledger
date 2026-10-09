import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

// Vite only exposes VITE_* variables to code. Server code reads secrets from process.env,
// so load .env / .env.local into it for dev and build. Variables already set in the real
// environment (Docker, CI, production) always win.
const config = defineConfig(({ mode }) => {
	for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ""))) {
		if (!(key in process.env)) process.env[key] = value;
	}
	return baseConfig;
});

const baseConfig = {
	resolve: { tsconfigPaths: true },
	plugins: [
		devtools(),
		nitro({ rollupConfig: { external: [/^@sentry\//] } }),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
		babel({ presets: [reactCompilerPreset()] }),
	],
};

export default config;
