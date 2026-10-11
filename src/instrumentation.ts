/**
 * Runs once when the server starts. Today it only starts Worldwide AI's Langfuse tracing, and only when the Langfuse keys are
 * set and only on the Node.js runtime; with no keys it does nothing at all.
 */
export async function register() {
	if (process.env.NEXT_RUNTIME !== "nodejs") return;
	if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) return;
	try {
		const { setupTracing } = await import("./lib/worldwide-ai/telemetry/setup");
		setupTracing();
	} catch (error) {
		// Tracing is optional: a problem starting it must never stop the store from serving pages.
		console.error(
			"[worldwide-ai] couldn't start Langfuse tracing:",
			error instanceof Error ? error.message : error,
		);
	}
}
