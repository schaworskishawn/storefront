import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		setupFiles: ["./vitest.setup.ts"],
		include: ["src/**/*.test.ts", "scripts/**/*.test.mjs"],
		exclude: ["src/**/*.export-harness.test.ts"],
	},
	resolve: {
		alias: {
			"@paper/session-bridge": path.resolve(__dirname, "./src/session-bridge/index.ts"),
			"@": path.resolve(__dirname, "./src"),
		},
	},
});
