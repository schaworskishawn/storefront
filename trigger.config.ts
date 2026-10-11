import { defineConfig } from "@trigger.dev/sdk";
import { createLangfuseExporter } from "./src/lib/worldwide-ai/telemetry/exporter";

// Langfuse tracing for the jobs, redacted before it leaves. Null (so nothing is added) unless both Langfuse keys are set in the
// Trigger.dev project's environment.
const langfuse = createLangfuseExporter();

/**
 * Trigger.dev owns Worldwide AI's schedules and background jobs (src/trigger). Set TRIGGER_PROJECT_REF to your project's ref
 * (it starts with "proj_"; Project settings in the Trigger.dev dashboard) before running `npx trigger.dev deploy`.
 * See docs/worldwide-ai.md.
 */
export default defineConfig({
	project: process.env.TRIGGER_PROJECT_REF ?? "proj_set_TRIGGER_PROJECT_REF",
	dirs: ["./src/trigger"],
	maxDuration: 600,
	...(langfuse ? { telemetry: { exporters: [langfuse] } } : {}),
	retries: {
		enabledInDev: false,
		default: { maxAttempts: 3, minTimeoutInMs: 2_000, maxTimeoutInMs: 30_000, factor: 2, randomize: true },
	},
});
