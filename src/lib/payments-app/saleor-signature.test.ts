import { createSign, generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { clearJwksCache, jwksUrlFor, verifySaleorSignature, type JwksFetcher } from "./saleor-signature";

const API_URL = "https://store.saleor.cloud/graphql/";

function makeKeys(kid: string) {
	const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
	return { jwk: { ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" }, privateKey };
}

/**
 * Builds a detached JWS like Saleor does: "<protected>..<signature>". Saleor's header has `"b64": false` and
 * `"crit": ["b64"]`, so the raw body is what gets signed. Pass `header` without `b64` for the plain RFC 7515 form, where
 * the base64url-encoded body is signed.
 */
function sign(
	body: string,
	privateKey: ReturnType<typeof makeKeys>["privateKey"],
	header: Record<string, unknown>,
) {
	const protectedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
	const signer = createSign("RSA-SHA256");
	signer.update(protectedHeader + ".");
	signer.update(
		header.b64 === false ? Buffer.from(body) : Buffer.from(Buffer.from(body).toString("base64url")),
	);
	return `${protectedHeader}..${signer.sign(privateKey).toString("base64url")}`;
}

const SALEOR_HEADER = { alg: "RS256", kid: "key-1", b64: false, crit: ["b64"] };

describe("verifySaleorSignature", () => {
	const keys = makeKeys("key-1");
	const body = JSON.stringify({ action: { amount: 12.5, currency: "USD" } });
	let fetchJwks: ReturnType<typeof vi.fn<JwksFetcher>>;

	const verifyWith = (overrides: Partial<Parameters<typeof verifySaleorSignature>[0]> = {}) =>
		verifySaleorSignature({
			rawBody: body,
			signature: sign(body, keys.privateKey, SALEOR_HEADER),
			requestApiUrl: API_URL,
			expectedApiUrl: API_URL,
			fetchJwks,
			...overrides,
		});

	beforeEach(() => {
		clearJwksCache();
		fetchJwks = vi.fn<JwksFetcher>().mockResolvedValue({ keys: [keys.jwk] });
	});

	it("accepts a body signed by Saleor's key", async () => {
		expect(await verifyWith()).toBe(true);
		expect(fetchJwks).toHaveBeenCalledWith("https://store.saleor.cloud/.well-known/jwks.json");
	});

	it("rejects a tampered body", async () => {
		expect(await verifyWith({ rawBody: body.replace("12.5", "0.01") })).toBe(false);
	});

	it("rejects a signature made with someone else's key", async () => {
		const attacker = makeKeys("key-1");
		expect(await verifyWith({ signature: sign(body, attacker.privateKey, SALEOR_HEADER) })).toBe(false);
	});

	it("never trusts a Saleor URL other than the configured one", async () => {
		expect(await verifyWith({ requestApiUrl: "https://evil.example/graphql/" })).toBe(false);
		expect(fetchJwks).not.toHaveBeenCalled();
	});

	it("treats a trailing slash as the same URL", async () => {
		expect(await verifyWith({ requestApiUrl: "https://store.saleor.cloud/graphql" })).toBe(true);
	});

	it("rejects missing or malformed signatures", async () => {
		expect(await verifyWith({ signature: null })).toBe(false);
		expect(await verifyWith({ signature: "" })).toBe(false);
		expect(await verifyWith({ signature: "not-a-jws" })).toBe(false);
		expect(await verifyWith({ signature: "a.b.c" })).toBe(false);
		expect(await verifyWith({ requestApiUrl: null })).toBe(false);
	});

	it("also accepts the plain form where the base64url body is signed, when the header has no b64", async () => {
		const plain = sign(body, keys.privateKey, { alg: "RS256", kid: "key-1" });
		expect(await verifyWith({ signature: plain })).toBe(true);
	});

	it("does not accept a raw-body signature when the header claims the encoded form, or the reverse", async () => {
		const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: "key-1" })).toString("base64url");
		const rawSigned = sign(body, keys.privateKey, SALEOR_HEADER).split("..")[1];
		expect(await verifyWith({ signature: `${header}..${rawSigned}` })).toBe(false);
	});

	it("refuses a critical header extension it does not understand", async () => {
		const unknown = sign(body, keys.privateKey, { ...SALEOR_HEADER, crit: ["b64", "exp"] });
		expect(await verifyWith({ signature: unknown })).toBe(false);
		expect(
			await verifyWith({ signature: sign(body, keys.privateKey, { ...SALEOR_HEADER, crit: "b64" }) }),
		).toBe(false);
	});

	it("pins RS256 so a token cannot pick a weaker algorithm", async () => {
		const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
		expect(await verifyWith({ signature: `${header}..` })).toBe(false);
		expect(await verifyWith({ signature: sign(body, keys.privateKey, { alg: "HS256", kid: "key-1" }) })).toBe(
			false,
		);
	});

	it("refetches the key set once when the key has rotated", async () => {
		const rotated = makeKeys("key-2");
		fetchJwks.mockResolvedValueOnce({ keys: [keys.jwk] }).mockResolvedValueOnce({ keys: [rotated.jwk] });

		// Prime the cache with the old key set, then present a signature from the new key.
		expect(await verifyWith()).toBe(true);
		const rotatedSignature = sign(body, rotated.privateKey, { ...SALEOR_HEADER, kid: "key-2" });
		expect(await verifyWith({ signature: rotatedSignature })).toBe(true);
		expect(fetchJwks).toHaveBeenCalledTimes(2);
	});

	it("fails closed when the key set cannot be fetched", async () => {
		fetchJwks.mockRejectedValue(new Error("network down"));
		const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		expect(await verifyWith()).toBe(false);
		spy.mockRestore();
	});

	it("builds the JWKS URL from the Saleor origin", () => {
		expect(jwksUrlFor(API_URL)).toBe("https://store.saleor.cloud/.well-known/jwks.json");
	});
});

/**
 * A signature produced with PyJWT (the library Saleor signs with) the way Saleor's `jws_encode` calls it:
 * `api_jws.encode(body, key, "RS256", headers={"kid": ..., "crit": ["b64"]}, is_payload_detached=True)`. Its protected
 * header is {"alg":"RS256","b64":false,"crit":["b64"],"kid":"test-kid","typ":"JWT"}. This is what real webhooks look like:
 * a verifier that assumes the base64url-encoded body rejects it (which is exactly how the first live install went wrong).
 */
describe("a signature made the way Saleor makes it", () => {
	const jwk = {
		kty: "RSA",
		alg: "RS256",
		use: "sig",
		kid: "test-kid",
		n: "tAR6FoSW8b3V8DL_-YhR-y9O_cg_y8IUVhwx09flk5VKhYpWc7ndmKaE5XKOasrBsqEwkHFG6jrqrKY5NAyDiw3YzRSB0gLlG6eo-22NUFVq0FN5BijN50bktiHnYhiue1K7e8dGPuo0w4O3zTzrSNayEpBCC14Zzi1cmz0uhJIn1WJn9VcplQeDU4JGF95LLpCIIV_o2SOb3HheCREQN3m0QV5Xi0cgUUkgfj5s6TXw7OiP9NM74mlbsKGO24FLcab5C9iZ75ULwFbjNOO9MMO6P62JJRXA5POMdSnz8UvwMAhAygiDkLirqxZKCUvRDtJY50mdS_L9rJixdXV0nw",
		e: "AQAB",
	};
	const body = '{"checkout": {"id": "Q2hlY2tvdXQ6MQ=="}, "note": "caf\u00e9 \u2713"}';
	const signature =
		"eyJhbGciOiJSUzI1NiIsImI2NCI6ZmFsc2UsImNyaXQiOlsiYjY0Il0sImtpZCI6InRlc3Qta2lkIiwidHlwIjoiSldUIn0..AEl2_GcXn-IGpnnPg7lIUwd8J4jF29gEhAkAHtHjxsB0m36MbufGk7YDPLqBrQgrM8YRvFVkdxI0RM0xsqLZw5A5cclNM_XA5fYtiUwJzuJW-htikr0IuV8O4gl7qs_Sc2hbADX2PbCiB2SX0NxGmy7glnxJOPJdhYkqIFzyR5J5UH60y83C4M4e2QpbXR7K92p6f32THjbUExxpWM310Jl9XYNHn3ihb61e4rCBpOjMwQt90PRz8WP6CC1CRHCzgK2j2SnoJL0jepbf0AhgIm_MwfE_7k1H8S4MkihI0wF_VHZMMQ8wKmENIQt3NuIaXo9epfAS2z9DNrWuCq9XOw";

	beforeEach(() => clearJwksCache());

	it("is accepted", async () => {
		const fetchJwks = vi.fn<JwksFetcher>().mockResolvedValue({ keys: [jwk] });
		expect(
			await verifySaleorSignature({
				rawBody: body,
				signature,
				requestApiUrl: API_URL,
				expectedApiUrl: API_URL,
				fetchJwks,
			}),
		).toBe(true);
	});

	it("is rejected if a single character of the body changes", async () => {
		const fetchJwks = vi.fn<JwksFetcher>().mockResolvedValue({ keys: [jwk] });
		expect(
			await verifySaleorSignature({
				rawBody: body.replace("Q2hlY2tvdXQ6MQ==", "Q2hlY2tvdXQ6Mg=="),
				signature,
				requestApiUrl: API_URL,
				expectedApiUrl: API_URL,
				fetchJwks,
			}),
		).toBe(false);
	});
});
