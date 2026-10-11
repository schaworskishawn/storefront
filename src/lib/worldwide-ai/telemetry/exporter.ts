import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { maskAttributes } from "./mask";

/**
 * Langfuse tracing for code that runs outside the Next.js server (the Trigger.dev jobs), where the official Langfuse span
 * processor can't be installed because the job runner owns the tracer. It exports spans to Langfuse's OpenTelemetry endpoint,
 * and every span is redacted first: attributes (prompts, outputs, anything else) and event attributes.
 */

/** Wraps an exporter so each span it is given is redacted before it leaves. The original spans aren't changed. */
export class MaskingSpanExporter implements SpanExporter {
	constructor(private readonly inner: SpanExporter) {}

	export(spans: ReadableSpan[], resultCallback: Parameters<SpanExporter["export"]>[1]): void {
		this.inner.export(spans.map(maskSpan), resultCallback);
	}
	shutdown(): Promise<void> {
		return this.inner.shutdown();
	}
	forceFlush(): Promise<void> {
		return this.inner.forceFlush?.() ?? Promise.resolve();
	}
}

/** A view of the span that behaves like it, with redacted attributes. (A prototype override, so every other field is the span's own.) */
export function maskSpan(span: ReadableSpan): ReadableSpan {
	return Object.create(span, {
		attributes: { value: maskAttributes(span.attributes as Record<string, unknown>), enumerable: true },
		events: {
			value: span.events.map((event) => ({
				...event,
				attributes: event.attributes
					? maskAttributes(event.attributes as Record<string, unknown>)
					: event.attributes,
			})),
			enumerable: true,
		},
	}) as ReadableSpan;
}

/** The Langfuse exporter for these settings, or null when Langfuse isn't configured. */
export function createLangfuseExporter(
	env: Record<string, string | undefined> = process.env,
	inner?: SpanExporter,
): SpanExporter | null {
	const publicKey = env.LANGFUSE_PUBLIC_KEY?.trim();
	const secretKey = env.LANGFUSE_SECRET_KEY?.trim();
	if (!publicKey || !secretKey) return null;
	const base = (env.LANGFUSE_BASE_URL?.trim() || "https://cloud.langfuse.com").replace(/\/+$/, "");
	return new MaskingSpanExporter(
		inner ??
			new OTLPTraceExporter({
				url: `${base}/api/public/otel/v1/traces`,
				headers: {
					Authorization: `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString("base64")}`,
					"x-langfuse-ingestion-version": "4",
				},
			}),
	);
}
