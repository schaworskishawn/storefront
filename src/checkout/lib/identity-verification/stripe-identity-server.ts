import "server-only";
import type { IdentityVerificationStatus } from "./keys";

/**
 * TEMPORARY STUB — `pnpm add stripe` hasn't finished installing in this environment yet, and
 * webpack resolves `import ... from "stripe"` at compile time regardless of whether the code
 * path actually runs, so a real import here breaks the *entire* checkout build (not just this
 * feature) until the package exists on disk. This stub keeps checkout building in the meantime;
 * every export throws if actually called (which `isStripeIdentityVerificationEnabled()` should already
 * be preventing). Restore the real Stripe SDK implementation as soon as `stripe` is installed —
 * see git history / the PR for this file's real contents.
 */

function notInstalled(): never {
	throw new Error(
		"The `stripe` package is not installed yet in this environment — identity verification " +
			"is temporarily stubbed out. Run `pnpm add stripe`, then restore the real implementation " +
			"of src/checkout/lib/identity-verification/stripe-identity-server.ts.",
	);
}

export type IdentityVerificationSessionResult = {
	id: string;
	clientSecret: string;
	status: IdentityVerificationStatus;
};

/** STUB — see file header. */
export async function createIdentityVerificationSession(
	_checkoutId: string,
): Promise<IdentityVerificationSessionResult> {
	notInstalled();
}

/** STUB — see file header. */
export async function retrieveIdentityVerificationSession(
	_sessionId: string,
): Promise<{ id: string; status: IdentityVerificationStatus; metadata?: Record<string, string> }> {
	notInstalled();
}

/** STUB — see file header. */
export function constructIdentityWebhookEvent(_rawBody: string, _signature: string): never {
	notInstalled();
}

/** STUB — see file header. */
export function getCheckoutIdFromSession(_session: { metadata?: Record<string, string> }): string | null {
	return null;
}
