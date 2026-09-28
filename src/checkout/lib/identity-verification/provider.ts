/**
 * Which identity-verification provider (if any) is active for the checkout IDENTITY step.
 * Mirrors the priority-registry idea already used for payment gateways
 * (`checkout/lib/payment/integrated-gateways.ts`), sized down for two providers kept
 * independent per the "keep both, decide later" call — each one configured, tested, and
 * potentially shipped without touching the other.
 *
 * AgeChecker is checked first: it's purpose-built for age-restricted retail (vape/alcohol/
 * tobacco) and has real, verified credentials as of this writing, vs. Stripe Identity which is a
 * general-purpose KYC product. Swap the order (or make it configurable) if that changes.
 *
 * Client-safe: only reads `NEXT_PUBLIC_*` vars (see the hydration-mismatch note in `./env.ts`).
 */
import { isAgeCheckerVerificationEnabled } from "./agechecker/env";
import { isStripeIdentityVerificationEnabled } from "./env";

export type IdentityProvider = "agechecker" | "stripe";

export function resolveIdentityProvider(): IdentityProvider | null {
	if (isAgeCheckerVerificationEnabled()) return "agechecker";
	if (isStripeIdentityVerificationEnabled()) return "stripe";
	return null;
}

/** Whether the checkout flow should include the IDENTITY step at all. */
export function isIdentityVerificationEnabled(): boolean {
	return resolveIdentityProvider() !== null;
}
