import { NextRequest } from "next/server";
import {
	CheckoutMetadataUpdateDocument,
	type CheckoutMetadataUpdateMutation,
	type CheckoutMetadataUpdateMutationVariables,
} from "@/checkout/graphql";
import {
	buildIdentityVerificationMetadata,
	type IdentityVerificationStatus,
} from "@/checkout/lib/identity-verification/keys";
import {
	constructIdentityWebhookEvent,
	getCheckoutIdFromSession,
} from "@/checkout/lib/identity-verification/stripe-identity-server";
import { toTypedDocument } from "@/checkout/lib/server/to-typed-document";
import { executeAppGraphQL } from "@/lib/graphql";

/**
 * Minimal local shapes for the two Stripe types this route touches, instead of `import type
 * Stripe from "stripe"` — the real SDK isn't installed in this environment yet (see
 * `stripe-identity-server.ts`'s stub), and even a type-only import fails plain `tsc` when the
 * package doesn't exist on disk at all (unlike a webpack bundle, which erases type-only imports
 * before ever trying to resolve them). Swap back to the real `Stripe.Event` /
 * `Stripe.Identity.VerificationSession` types alongside restoring `stripe-identity-server.ts`.
 */
type StripeEventStub = { type: string; data: { object: unknown } };
type StripeVerificationSessionStub = { id: string; status: string; metadata?: Record<string, string> };

/**
 * Stripe Identity webhook — the *durable* record of a verification result.
 *
 * `identity-actions.ts` already writes an immediate status right after the shopper finishes
 * Stripe's modal (a live `verificationSessions.retrieve()` call), so the checkout step doesn't
 * sit there waiting for this webhook. This handler exists because that immediate read can race
 * Stripe's own async document checks (`processing` → `verified`/`requires_input` sometimes
 * finishes seconds later) and because it's the one write that happens even if the shopper closes
 * the tab before the client-side status refresh runs.
 *
 * Configure in the Stripe Dashboard: Developers → Webhooks → add endpoint
 * `https://your-site.com/api/webhooks/stripe-identity`, events
 * `identity.verification_session.verified` and `identity.verification_session.requires_input`.
 * Copy the signing secret into `STRIPE_IDENTITY_WEBHOOK_SECRET`.
 *
 * Uses the Saleor **app token** (`SALEOR_APP_TOKEN`), not a shopper session — Stripe calls this
 * endpoint directly, with no Saleor auth cookie attached. The app needs `MANAGE_CHECKOUTS` (or
 * broader) permission in Saleor for `updateMetadata` to succeed here.
 */

const checkoutMetadataUpdateDocument = toTypedDocument<
	CheckoutMetadataUpdateMutation,
	CheckoutMetadataUpdateMutationVariables
>(CheckoutMetadataUpdateDocument);

const HANDLED_EVENTS = new Set([
	"identity.verification_session.verified",
	"identity.verification_session.requires_input",
	"identity.verification_session.processing",
	"identity.verification_session.canceled",
]);

export async function POST(request: NextRequest) {
	const rawBody = await request.text();
	const signature = request.headers.get("stripe-signature");

	if (!signature) {
		return Response.json({ error: "Missing stripe-signature header" }, { status: 400 });
	}

	let event: StripeEventStub;
	try {
		event = constructIdentityWebhookEvent(rawBody, signature) as StripeEventStub;
	} catch (error) {
		console.warn("[StripeIdentity] Signature verification failed:", error);
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	if (!HANDLED_EVENTS.has(event.type)) {
		return Response.json({ received: true, skipped: true });
	}

	const session = event.data.object as StripeVerificationSessionStub;
	const checkoutId = getCheckoutIdFromSession(session);

	if (!checkoutId) {
		console.warn("[StripeIdentity] Verification session has no checkoutId in metadata:", session.id);
		return Response.json({ received: true, skipped: true, reason: "missing_checkout_id" });
	}

	const result = await executeAppGraphQL(checkoutMetadataUpdateDocument, {
		variables: {
			id: checkoutId,
			input: buildIdentityVerificationMetadata(session.id, session.status as IdentityVerificationStatus),
		},
		cache: "no-cache",
	});

	if (!result.ok) {
		console.error("[StripeIdentity] Failed to persist status to checkout metadata:", result.error.message);
		// 500 so Stripe retries — the checkout-side status read isn't blocked on this succeeding,
		// but we still want the durable record to eventually land.
		return Response.json({ error: "Failed to update checkout" }, { status: 500 });
	}

	const errors = result.data.updateMetadata?.errors ?? [];
	if (errors.length > 0) {
		console.error("[StripeIdentity] Saleor rejected metadata update:", errors);
		return Response.json({ error: "Saleor rejected metadata update" }, { status: 500 });
	}

	console.log("[StripeIdentity] Recorded status:", {
		checkoutId,
		sessionId: session.id,
		status: session.status,
	});
	return Response.json({ received: true });
}
