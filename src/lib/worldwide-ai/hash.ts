import { createHash, randomUUID } from "node:crypto";

/** Hashing and ids. Plain Node, so it works in the Next.js server, in background jobs and in tests. */

export const sha256Hex = (data: string | Uint8Array): string =>
	createHash("sha256").update(data).digest("hex");

export const newId = (): string => randomUUID();

/** A stable key from parts, for idempotency: the same parts always give the same key, and nothing ambiguous joins them. */
export const keyFrom = (...parts: Array<string | number>): string => sha256Hex(JSON.stringify(parts));
