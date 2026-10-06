import "server-only";

import { createPublicKey, verify, type JsonWebKey } from "node:crypto";

/**
 * Verifies that a webhook really came from our Saleor instance.
 *
 * Saleor signs the raw request body with RS256 and sends a detached JWS ("<protected>..<signature>") in the
 * `saleor-signature` header; the matching public keys are published at `<saleor origin>/.well-known/jwks.json`.
 * We only ever trust the Saleor URL from our own config (never the one named in the request), so an attacker cannot
 * point us at their own key set.
 *
 * What is signed matters: Saleor's header carries `"b64": false` with `"crit": ["b64"]` (RFC 7797), which means the
 * signature covers the raw body bytes, not their base64url form. Assuming the usual base64url form rejected every genuine
 * webhook ("bad or missing signature"), so both forms are handled, chosen by the header, as the standard says.
 */

type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
type Jwks = { keys: Jwk[] };

export type JwksFetcher = (jwksUrl: string) => Promise<Jwks>;

const JWKS_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, { fetchedAt: number; jwks: Jwks }>();

const defaultFetchJwks: JwksFetcher = async (jwksUrl) => {
	const res = await fetch(jwksUrl, { cache: "no-store" });
	if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
	return (await res.json()) as Jwks;
};

function normalizeApiUrl(url: string): string {
	return url.trim().replace(/\/+$/, "");
}

export function jwksUrlFor(saleorApiUrl: string): string {
	return `${new URL(saleorApiUrl).origin}/.well-known/jwks.json`;
}

async function loadJwks(jwksUrl: string, fetchJwks: JwksFetcher, forceRefresh: boolean): Promise<Jwks> {
	const cached = cache.get(jwksUrl);
	if (!forceRefresh && cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS) return cached.jwks;
	const jwks = await fetchJwks(jwksUrl);
	cache.set(jwksUrl, { fetchedAt: Date.now(), jwks });
	return jwks;
}

/** Test helper — drops cached key sets. */
export function clearJwksCache(): void {
	cache.clear();
}

export async function verifySaleorSignature({
	rawBody,
	signature,
	requestApiUrl,
	expectedApiUrl,
	fetchJwks = defaultFetchJwks,
}: {
	rawBody: string;
	signature: string | null | undefined;
	/** The `saleor-api-url` header the request claims to come from. */
	requestApiUrl: string | null | undefined;
	/** Our configured Saleor API URL (NEXT_PUBLIC_SALEOR_API_URL). */
	expectedApiUrl: string | null | undefined;
	fetchJwks?: JwksFetcher;
}): Promise<boolean> {
	if (!signature || !requestApiUrl || !expectedApiUrl) return false;
	if (normalizeApiUrl(requestApiUrl) !== normalizeApiUrl(expectedApiUrl)) return false;

	const parts = signature.split(".");
	// Detached payload: header, empty payload, signature.
	if (parts.length !== 3 || parts[1] !== "" || !parts[0] || !parts[2]) return false;

	let header: { alg?: string; kid?: string; b64?: boolean; crit?: unknown };
	try {
		header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as {
			alg?: string;
			kid?: string;
			b64?: boolean;
			crit?: unknown;
		};
	} catch {
		return false;
	}
	// Pin the algorithm — never let the token choose how it is verified.
	if (header.alg !== "RS256") return false;
	// `crit` lists extensions the verifier must understand; "b64" is the only one handled here.
	if (
		header.crit !== undefined &&
		(!Array.isArray(header.crit) || header.crit.some((name) => name !== "b64"))
	) {
		return false;
	}

	const payload = Buffer.from(rawBody, "utf8");
	const signingInput =
		header.b64 === false
			? Buffer.concat([Buffer.from(`${parts[0]}.`), payload])
			: Buffer.from(`${parts[0]}.${payload.toString("base64url")}`);
	const signatureBytes = Buffer.from(parts[2], "base64url");
	const jwksUrl = jwksUrlFor(expectedApiUrl);

	const tryVerify = (jwks: Jwks): boolean => {
		const candidates = header.kid ? jwks.keys.filter((key) => key.kid === header.kid) : jwks.keys;
		return candidates.some((jwk) => {
			try {
				return verify(
					"RSA-SHA256",
					signingInput,
					createPublicKey({ key: jwk, format: "jwk" }),
					signatureBytes,
				);
			} catch {
				return false;
			}
		});
	};

	try {
		if (tryVerify(await loadJwks(jwksUrl, fetchJwks, false))) return true;
		// The key may have rotated since we cached the set: refetch once and retry.
		return tryVerify(await loadJwks(jwksUrl, fetchJwks, true));
	} catch (error) {
		console.error("[payments-app] could not verify Saleor signature", error);
		return false;
	}
}
