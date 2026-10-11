import type { ReadableSpan, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { describe, expect, it, vi } from "vitest";
import { MaskingSpanExporter, createLangfuseExporter, maskSpan } from "./exporter";
import { maskAttributes, maskTraceData } from "./mask";

describe("masking what is sent to Langfuse", () => {
	it("removes personal details and secrets from text", () => {
		const out = maskTraceData(
			"Reply to jane@example.com, call 204-555-0142, card 4242 4242 4242 4242, key sk-ant-api03-abcdefghijklmno",
		);
		expect(out).not.toMatch(/jane@example|204-555|4242 4242|abcdefghijklmno/);
		expect(out).toContain("[email]");
	});

	it("walks into JSON text, redacting inside it and dropping secret-named fields", () => {
		const out = maskTraceData(
			JSON.stringify({
				to: "jane@example.com",
				apiKey: "xyz",
				nested: { note: "call 204-555-0142" },
				inputTokens: 120,
			}),
		);
		expect(JSON.parse(out)).toEqual({
			to: "[email]",
			apiKey: "[redacted]",
			nested: { note: "call [phone]" },
			inputTokens: 120,
		});
	});

	it("handles arrays, objects, invalid JSON and non-text values", () => {
		expect(maskTraceData(["a@b.co", 5])).toEqual(["[email]", 5]);
		expect(maskTraceData({ password: "x", ok: "fine" })).toEqual({ password: "[redacted]", ok: "fine" });
		expect(maskTraceData("{not json a@b.co")).toBe("{not json [email]");
		expect(maskTraceData(42)).toBe(42);
		expect(maskTraceData(null)).toBeNull();
	});

	it("masks every attribute of a span, including lists", () => {
		expect(
			maskAttributes({
				"ai.prompt": "email a@b.co",
				"gen_ai.usage.input_tokens": 12,
				list: ["x@y.co", "plain"],
			}),
		).toEqual({
			"ai.prompt": "email [email]",
			"gen_ai.usage.input_tokens": 12,
			list: ["[email]", "plain"],
		});
	});
});

const span = (
	attributes: Record<string, unknown>,
	events: Array<{ name: string; attributes?: Record<string, unknown> }> = [],
) =>
	({
		name: "ai.generateText",
		attributes,
		events,
		spanContext: () => ({ traceId: "t", spanId: "s" }),
		duration: [0, 5],
	}) as unknown as ReadableSpan;

describe("the Langfuse exporter", () => {
	it("redacts a span's attributes and events and leaves everything else as it was, without changing the original", () => {
		const original = span({ "ai.response.text": "Call jane@example.com", ok: 1 }, [
			{ name: "e", attributes: { detail: "a@b.co" } },
		]);
		const masked = maskSpan(original);
		expect(masked.attributes).toEqual({ "ai.response.text": "Call [email]", ok: 1 });
		expect(masked.events[0].attributes).toEqual({ detail: "[email]" });
		expect(masked.name).toBe("ai.generateText");
		expect(masked.spanContext()).toEqual({ traceId: "t", spanId: "s" });
		expect(original.attributes["ai.response.text"]).toBe("Call jane@example.com");
	});

	it("hands the inner exporter only redacted spans, and passes shutdown and flush through", async () => {
		const exported: ReadableSpan[][] = [];
		const inner: SpanExporter = {
			export: (spans, done) => {
				exported.push(spans);
				done({ code: 0 });
			},
			shutdown: vi.fn(async () => undefined),
			forceFlush: vi.fn(async () => undefined),
		};
		const exporter = new MaskingSpanExporter(inner);
		const done = vi.fn();
		exporter.export([span({ prompt: "to jane@example.com" })], done);
		expect(exported[0][0].attributes).toEqual({ prompt: "to [email]" });
		expect(done).toHaveBeenCalledWith({ code: 0 });
		await exporter.shutdown();
		await exporter.forceFlush();
		expect(inner.shutdown).toHaveBeenCalled();
		expect(inner.forceFlush).toHaveBeenCalled();
	});

	it("is null unless both keys are set, and points at the configured Langfuse", () => {
		expect(createLangfuseExporter({})).toBeNull();
		expect(createLangfuseExporter({ LANGFUSE_PUBLIC_KEY: "pk" })).toBeNull();
		const inner: SpanExporter = { export: vi.fn(), shutdown: async () => undefined };
		expect(
			createLangfuseExporter({ LANGFUSE_PUBLIC_KEY: "pk", LANGFUSE_SECRET_KEY: "sk" }, inner),
		).toBeInstanceOf(MaskingSpanExporter);
		expect(
			createLangfuseExporter({
				LANGFUSE_PUBLIC_KEY: "pk",
				LANGFUSE_SECRET_KEY: "sk",
				LANGFUSE_BASE_URL: "https://lf.example.com/",
			}),
		).toBeInstanceOf(MaskingSpanExporter);
	});
});

describe("starting tracing", () => {
	it("does nothing without both keys, and registers everything when they are set", async () => {
		const registerOTel = vi.fn();
		const registerTelemetry = vi.fn();
		const processorOptions: unknown[] = [];
		vi.resetModules();
		vi.doMock("@vercel/otel", () => ({ registerOTel }));
		vi.doMock("ai", () => ({ registerTelemetry }));
		vi.doMock("@langfuse/otel", () => ({
			LangfuseSpanProcessor: class {
				constructor(options: unknown) {
					processorOptions.push(options);
				}
			},
		}));
		vi.doMock("@langfuse/vercel-ai-sdk", () => ({ LangfuseVercelAiSdkIntegration: class {} }));
		const { setupTracing } = await import("./setup");

		expect(setupTracing({})).toBe(false);
		expect(setupTracing({ LANGFUSE_PUBLIC_KEY: "pk" })).toBe(false);
		expect(registerOTel).not.toHaveBeenCalled();

		expect(
			setupTracing({ LANGFUSE_PUBLIC_KEY: "pk", LANGFUSE_SECRET_KEY: "sk", VERCEL_ENV: "production" }),
		).toBe(true);
		expect(registerOTel).toHaveBeenCalledTimes(1);
		expect(registerTelemetry).toHaveBeenCalledTimes(1);
		const options = processorOptions[0] as {
			mask: (p: { data: unknown }) => unknown;
			exportMode: string;
			environment: string;
		};
		expect(options.exportMode).toBe("immediate");
		expect(options.environment).toBe("production");
		expect(options.mask({ data: "to a@b.co" })).toBe("to [email]");
		// A second call doesn't register twice.
		expect(setupTracing({ LANGFUSE_PUBLIC_KEY: "pk", LANGFUSE_SECRET_KEY: "sk" })).toBe(true);
		expect(registerOTel).toHaveBeenCalledTimes(1);
		vi.doUnmock("@vercel/otel");
		vi.doUnmock("ai");
		vi.doUnmock("@langfuse/otel");
		vi.doUnmock("@langfuse/vercel-ai-sdk");
	});
});
