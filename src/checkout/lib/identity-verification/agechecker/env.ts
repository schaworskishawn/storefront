/**
 * AgeChecker.Net — a purpose-built age/identity verification service (used by many vape/alcohol/
 * tobacco retailers), as an alternative to the Stripe Identity step in `../stripe-identity-server.ts`.
 * Per the project's "keep both, decide later" call: this is a fully independent module: own env
 * vars, own metadata namespace, own status vocabulary — nothing here touches the Stripe path.
 *
 * The domain API key is *meant* to be public — AgeChecker's own docs have merchants embed it
 * directly in a client-side `<script>` tag for their popup widget — so it's `NEXT_PUBLIC_`, safe
 * to read on both server and client, and (like `identity-verification/env.ts`) safe to use from
 * `flow.ts` without risking a server/client hydration mismatch.
 */

export function isAgeCheckerVerificationEnabled(): boolean {
	if (process.env.NEXT_PUBLIC_ENABLE_AGECHECKER_VERIFICATION === "false") {
		return false;
	}
	return Boolean(process.env.NEXT_PUBLIC_AGECHECKER_API_KEY);
}

export function getAgeCheckerApiKey(): string | undefined {
	return process.env.NEXT_PUBLIC_AGECHECKER_API_KEY;
}

/**
 * Optional — only needed for `options.min_age` overrides, `options.callback_url` (webhook), and
 * verifying the webhook's `X-AgeChecker-Signature`. Server-only; deliberately not `NEXT_PUBLIC_`.
 * Without it, verification still works via AgeChecker's account/site-level default minimum age
 * and polling `/v1/status/:uuid` for the result instead of a webhook push.
 */
export function getAgeCheckerAccountSecret(): string | undefined {
	return process.env.AGECHECKER_ACCOUNT_SECRET;
}
