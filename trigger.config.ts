import { defineConfig } from "@trigger.dev/sdk";

/**
 * Trigger.dev owns Worldwide AI's schedules and background jobs (src/trigger). Set TRIGGER_PROJECT_REF to your project's ref
 * (it starts with "proj_"; Project settings in the Trigger.dev dashboard) before running `npx trigger.dev deploy`.
 * See docs/worldwide-ai.md.
 */
export default defineConfig({
	project: process.env.TRIGGER_PROJECT_REF ?? "proj_set_TRIGGER_PROJECT_REF",
	dirs: ["./src/trigger"],
	maxDuration: 600,
	retries: {
		enabledInDev: false,
		default: { maxAttempts: 3, minTimeoutInMs: 2_000, maxTimeoutInMs: 30_000, factor: 2, randomize: true },
	},
});
