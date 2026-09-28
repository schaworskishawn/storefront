"use server";

/**
 * Server actions for the checkout "Verify Identity" step. Kept separate from the main
 * `actions.ts` because it pulls in the server-only Stripe Identity SDK (`stripe`, not the
 * `@stripe/*` client packages checkout payments already use) — see
 * `checkout/lib/identity-verification/` for why Identity needs its own key pair.
 *
 * We never see the uploaded ID document: Stripe's hosted `verifyIdentity()` modal captures it
 * client-side and stores/redacts it on Stripe's side. This app only ever persists a session id
 * and a pass/fail status on checkout metadata.
 */
import {
	CheckoutMetadataUpdateDocument,
	type CheckoutMetadataUpdateMutation,
	type CheckoutMetadataUpdateMutationVariables,
} from "@/checkout/graphql";
import type {
	IdentityVerificationSessionActionResult,
	IdentityVerificationStatusActionResult,
} from "@/checkout/lib/checkout-action-types";
import { isStripeIdentityVerificationEnabled } from "@/checkout/lib/identity-verification/env";
import {
	buildIdentityVerificationMetadata,
	type IdentityVerificationStatus,
} from "@/checkout/lib/identity-verification/keys";
import { getCheckoutServerTranslations } from "@/checkout/lib/server/get-checkout-server-translations";
import { toTypedDocument } from "@/checkout/lib/server/to-typed-document";
import { executeAuthenticatedGraphQL } from "@/lib/graphql";
import {
	createIdentityVerificationSession,
	retrieveIdentityVerificationSession,
} from "@/checkout/lib/identity-verification/stripe-identity-server";

const checkoutMetadataUpdateDocument = toTypedDocument<
	CheckoutMetadataUpdateMutation,
	CheckoutMetadataUpdateMutationVariables
>(CheckoutMetadataUpdateDocument);

async function saveIdentityVerificationMetadata(
	checkoutId: string,
	sessionId: string,
	status: IdentityVerificationStatus,
) {
	// Best-effort: a failure here shouldn't block the shopper — the webhook (durable) and the
	// live Stripe retrieve (authoritative) are the real sources of truth for this render. It only
	// means a page refresh before the webhook lands would show the "verify" button again.
	await executeAuthenticatedGraphQL(checkoutMetadataUpdateDocument, {
		variables: {
			id: checkoutId,
			input: buildIdentityVerificationMetadata(sessionId, status),
		},
		cache: "no-cache",
	}).catch(() => null);
}

/** Starts a new Stripe Identity verification session for this checkout. */
export async function createIdentityVerification(
	checkoutId: string,
): Promise<IdentityVerificationSessionActionResult> {
	if (!isStripeIdentityVerificationEnabled()) {
		const { server: t } = await getCheckoutServerTranslations();
		return { ok: false, error: t("identityVerificationDisabled") };
	}

	try {
		const session = await createIdentityVerificationSession(checkoutId);
		await saveIdentityVerificationMetadata(checkoutId, session.id, session.status);
		return { ok: true, clientSecret: session.clientSecret, sessionId: session.id };
	} catch (error) {
		console.error("[Identity] Failed to create verification session:", error);
		const { server: t } = await getCheckoutServerTranslations();
		return { ok: false, error: t("identityVerificationInitFailed") };
	}
}

/**
 * Live status read, used right after the Stripe modal closes — don't wait on the webhook for
 * the UI to update. The webhook is still what persists the final status (see the route handler)
 * so a page refresh reflects it too.
 */
export async function refreshIdentityVerificationStatus(
	checkoutId: string,
	sessionId: string,
): Promise<IdentityVerificationStatusActionResult> {
	if (!isStripeIdentityVerificationEnabled()) {
		const { server: t } = await getCheckoutServerTranslations();
		return { ok: false, error: t("identityVerificationDisabled") };
	}

	try {
		const session = await retrieveIdentityVerificationSession(sessionId);
		await saveIdentityVerificationMetadata(checkoutId, session.id, session.status);
		return { ok: true, status: session.status };
	} catch (error) {
		console.error("[Identity] Failed to read verification status:", error);
		const { server: t } = await getCheckoutServerTranslations();
		return { ok: false, error: t("identityVerificationStatusFailed") };
	}
}
