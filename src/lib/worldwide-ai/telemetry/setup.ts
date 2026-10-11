import { LangfuseSpanProcessor } from "@langfuse/otel";
import { LangfuseVercelAiSdkIntegration } from "@langfuse/vercel-ai-sdk";
import { registerOTel } from "@vercel/otel";
import { registerTelemetry } from "ai";
import { maskTraceData } from "./mask";

/**
 * Langfuse tracing for the Next.js server, started once from instrumentation.ts. It does nothing unless both Langfuse keys
 * are set. Everything sent is redacted by `maskTraceData`, only AI-related spans are exported (the Langfuse processor's
 * default), and spans are sent as they finish because serverless functions don't live long enough to batch.
 *
 * Whether prompts and outputs are recorded at all is decided where the model is called (WORLDWIDE_AI_RECORD_RAW; off by
 * default), so by default only token counts, timing, model and prompt version reach Langfuse.
 */

let started = false;

export function setupTracing(env: Record<string, string | undefined> = process.env): boolean {
	if (started) return true;
	if (!env.LANGFUSE_PUBLIC_KEY?.trim() || !env.LANGFUSE_SECRET_KEY?.trim()) return false;
	const processor = new LangfuseSpanProcessor({
		exportMode: "immediate",
		mask: ({ data }) => maskTraceData(data),
		environment: env.VERCEL_ENV ?? env.NODE_ENV,
		release: env.VERCEL_GIT_COMMIT_SHA,
	});
	registerOTel({ serviceName: "worldwide-vapor-storefront", spanProcessors: [processor] });
	registerTelemetry(new LangfuseVercelAiSdkIntegration());
	started = true;
	return true;
}
