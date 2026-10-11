import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		setupFiles: ["./vitest.setup.ts"],
		include: ["src/**/*.test.ts", "scripts/**/*.test.mjs", "openclaw-host/**/*.test.mjs"],
		exclude: ["src/**/*.export-harness.test.ts"],
		// Each Worldwide AI test file starts its own in-process Postgres and runs the real migrations on it. With every
		// file doing that at once on a busy machine, the default 5 and 10 second limits are too tight for the setup alone.
		testTimeout: 30_000,
		hookTimeout: 60_000,
	},
	resolve: {
		alias: {
			"@paper/session-bridge": path.resolve(__dirname, "./src/session-bridge/index.ts"),
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
