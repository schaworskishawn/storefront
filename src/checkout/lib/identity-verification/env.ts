/**
 * Identity verification is a *separate* Stripe product from payments (Stripe Identity, not
 * Stripe Payments): it needs its own secret/publishable key pair and webhook secret because
 * Saleor's Stripe payment app never exposes a Stripe secret key to the storefront (see
 * `checkout-payment-gateways.md` — "Publishable keys come from paymentGatewayInitialize, not
 * env"). This file mirrors the on/off-flag shape of `lib/payment/providers/stripe.ts`.
 *
 * This is one of two identity-verification providers (see `agechecker/env.ts`) — `provider.ts`
 * decides which one (if either) is actually active. Only import this file directly for
 * Stripe-specific concerns; use `provider.ts` for the general "is the IDENTITY step on" question.
 *
 * `isStripeIdentityVerificationEnabled()` is called (transitively, via `provider.ts`) from
 * `flow.ts`, which a `"use client"` component (`SaleorCheckout`) still executes during SSR as well
 * as in the browser — so it must only read `NEXT_PUBLIC_*` vars, which Next.js inlines identically
 * into both the server and client bundles. Reading a server-only secret (e.g.
 * `STRIPE_IDENTITY_SECRET_KEY`) here would make the server and client disagree on whether the
 * step exists (real on the server, always `undefined` in the client bundle) and produce a
 * hydration mismatch. The secret is checked separately, server-side only, right before the Stripe
 * API call in `identity-actions.ts`.
 */

/** Required on cloud/staging; auto-enabled once the publishable key is set. */
export function isStripeIdentityVerificationEnabled(): boolean {
	if (process.env.NEXT_PUBLIC_ENABLE_IDENTITY_VERIFICATION === "false") {
		return false;
	}
	return Boolean(process.env.NEXT_PUBLIC_STRIPE_IDENTITY_PUBLISHABLE_KEY);
}

export function getStripeIdentityPublishableKey(): string | undefined {
	return process.env.NEXT_PUBLIC_STRIPE_IDENTITY_PUBLISHABLE_KEY;
}
