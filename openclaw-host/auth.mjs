// @ts-check
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Request signing between the storefront and the adapter. Every request carries a timestamp and an HMAC of
 * "<timestamp>\n<METHOD>\n<path and query>\n<sha256 of the body>" made with a shared secret, so the adapter only acts on
 * requests from the storefront, a captured request can't be altered, and a stale one is refused. The storefront imports
 * `signRequest` from here, so both ends compute it the same way.
 */

export const MAX_SKEW_MS = 5 * 60 * 1000;

/** @param {string} text */
const sha256 = (text) => createHash("sha256").update(text).digest("hex");

/**
 * @param {string} secret
 * @param {{ method: string, path: string, body?: string, timestamp: number }} request
 * @returns {string} lower-case hex
 */
export function signRequest(secret, { method, path, body = "", timestamp }) {
	return createHmac("sha256", secret)
		.update(`${timestamp}\n${method.toUpperCase()}\n${path}\n${sha256(body)}`)
		.digest("hex");
}

/**
 * @param {string} secret
 * @param {{ method: string, path: string, body?: string, timestamp: string | undefined, signature: string | undefined }} request
 * @param {number} [now]
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function verifyRequest(secret, { method, path, body = "", timestamp, signature }, now = Date.now()) {
	if (!secret) return { ok: false, reason: "The adapter has no secret configured." };
	const ts = Number(timestamp);
	if (!timestamp || !Number.isFinite(ts)) return { ok: false, reason: "Missing timestamp." };
	if (Math.abs(now - ts) > MAX_SKEW_MS)
		return { ok: false, reason: "The request is too old or from the future." };
	if (!signature || !/^[a-f0-9]{64}$/.test(signature))
		return { ok: false, reason: "Missing or malformed signature." };
	const expected = Buffer.from(signRequest(secret, { method, path, body, timestamp: ts }), "hex");
	const given = Buffer.from(signature, "hex");
	return given.length === expected.length && timingSafeEqual(given, expected)
		? { ok: true }
		: { ok: false, reason: "The signature doesn't match." };
}

export const HEADER_TIMESTAMP = "x-wai-timestamp";
export const HEADER_SIGNATURE = "x-wai-signature";
