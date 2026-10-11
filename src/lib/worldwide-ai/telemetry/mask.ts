import { redactDeep, redactText } from "../redact";

/**
 * Redaction for what is sent to Langfuse. Every value that leaves for the tracing service goes through this first: strings
 * have emails, phone numbers, card numbers and keys removed; objects are walked; and a string that is really JSON (as span
 * attributes often are) is parsed, redacted field by field (so fields named like a password are dropped), and put back as JSON.
 */

export function maskTraceData<T>(data: T): T {
	if (typeof data === "string") {
		const trimmed = data.trim();
		if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
			try {
				return JSON.stringify(redactDeep(JSON.parse(trimmed))) as T;
			} catch {
				// Not valid JSON after all: treat it as text.
			}
		}
		return redactText(data) as T;
	}
	return redactDeep(data);
}

/** The attributes of a span, redacted (string values, including JSON text, and nested values in arrays). */
export function maskAttributes(attributes: Record<string, unknown>): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(attributes).map(([key, value]) => [
			key,
			Array.isArray(value) ? value.map((v) => maskTraceData(v)) : maskTraceData(value),
		]),
	);
}
