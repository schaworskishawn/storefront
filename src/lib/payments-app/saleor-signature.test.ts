import { createSign, generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { clearJwksCache, jwksUrlFor, verifySaleorSignature, type JwksFetcher } from "./saleor-signature";

const API_URL = "https://store.saleor.cloud/graphql/";

function makeKeys(kid: string) {
	const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
	return { jwk: { ...publicKey.export({ format: "jwk" }), kid, alg: "RS256", use: "sig" }, privateKey };
}

/** Builds a detached JWS exactly like Saleor does: "<protected>..<signature>". */
function sign(
	body: string,
	privateKey: ReturnType<typeof makeKeys>["privateKey"],
	header: Record<string, unknown>,
) {
	const protectedHeader = Buffer.from(JSON.stringify(header)).toString("base64url");
	const signer = createSign("RSA-SHA256");
	signer.update(`${protectedHeader}.${Buffer.from(body).toString("base64url")}`);
	return `${protectedHeader}..${signer.sign(privateKey).toString("base64url")}`;
}

describe("verifySaleorSignature", () => {
	const keys = makeKeys("key-1");
	const body = JSON.stringify({ action: { amount: 12.5, currency: "USD" } });
	let fetchJwks: ReturnType<typeof vi.fn<JwksFetcher>>;

	const verifyWith = (overrides: Partial<Parameters<typeof verifySaleorSignature>[0]> = {}) =>
		verifySaleorSignature({
			rawBody: body,
			signature: sign(body, keys.privateKey, { alg: "RS256", kid: "key-1" }),
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
		expect(
			await verifyWith({ signature: sign(body, attacker.privateKey, { alg: "RS256", kid: "key-1" }) }),
		).toBe(false);
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
		const rotatedSignature = sign(body, rotated.privateKey, { alg: "RS256", kid: "key-2" });
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
