"use server";

/**
 * Server actions for the checkout "Verify Identity" step, AgeChecker.Net provider. Parallel to
 * `identity-actions.ts` (Stripe Identity) — independent per the "keep both, decide later" call.
 *
 * Unlike Stripe Identity, AgeChecker has no server SDK — these are plain `fetch` calls (see
 * `checkout/lib/identity-verification/agechecker/client.ts`), so there's no install to wait on.
 */
import {
	CheckoutMetadataUpdateDocument,
	type CheckoutMetadataUpdateMutation,
	type CheckoutMetadataUpdateMutationVariables,
} from "@/checkout/graphql";
import type { AgeCheckerVerificationActionResult } from "@/checkout/lib/checkout-action-types";
import {
	AgeCheckerApiError,
	createAgeCheckerVerification,
	getAgeCheckerVerificationStatus,
	type AgeCheckerCustomerData,
} from "@/checkout/lib/identity-verification/agechecker/client";
import { isAgeCheckerVerificationEnabled } from "@/checkout/lib/identity-verification/agechecker/env";
import {
	buildAgeCheckerMetadata,
	type AgeCheckerStatus,
} from "@/checkout/lib/identity-verification/agechecker/keys";
import { getCheckoutServerTranslations } from "@/checkout/lib/server/get-checkout-server-translations";
import { toTypedDocument } from "@/checkout/lib/server/to-typed-document";
import { executeAuthenticatedGraphQL } from "@/lib/graphql";

const checkoutMetadataUpdateDocument = toTypedDocument<
	CheckoutMetadataUpdateMutation,
	CheckoutMetadataUpdateMutationVariables
>(CheckoutMetadataUpdateDocument);

async function saveAgeCheckerMetadata(
	checkoutId: string,
	uuid: string | undefined,
	status: AgeCheckerStatus,
) {
	// Best-effort, same rationale as the Stripe Identity actions: a failure here shouldn't block
	// the shopper. It only means a page refresh before this lands would re-show the start button.
	await executeAuthenticatedGraphQL(checkoutMetadataUpdateDocument, {
		variables: {
			id: checkoutId,
			input: buildAgeCheckerMetadata(uuid, status),
		},
		cache: "no-cache",
	}).catch(() => null);
}

export type AgeCheckerVerificationInput = AgeCheckerCustomerData;

/** Submits customer data for a new AgeChecker verification (`POST /v1/create`). */
export async function createAgeCheckerVerificationAction(
	checkoutId: string,
	data: AgeCheckerVerificationInput,
): Promise<AgeCheckerVerificationActionResult> {
	if (!isAgeCheckerVerificationEnabled()) {
		const { server: t } = await getCheckoutServerTranslations();
		return { ok: false, error: t("agecheckerVerificationDisabled") };
	}

	try {
		// `metadata` only actually reaches AgeChecker once AGECHECKER_ACCOUNT_SECRET is set (see
		// client.ts — `options` requires the secret); harmless to pass unconditionally here.
		const result = await createAgeCheckerVerification(data, { metadata: { checkoutId } });
		await saveAgeCheckerMetadata(checkoutId, result.uuid, result.status);
		return { ok: true, uuid: result.uuid, status: result.status };
	} catch (error) {
		console.error("[AgeChecker] Failed to create verification:", error);
		const { server: t } = await getCheckoutServerTranslations();
		if (error instanceof AgeCheckerApiError) {
			return { ok: false, error: error.message };
		}
		return { ok: false, error: t("agecheckerVerificationInitFailed") };
	}
}

/** Re-reads verification status (`GET /v1/status/:uuid`) — used after the AgeChecker popup closes. */
export async function refreshAgeCheckerVerificationStatus(
	checkoutId: string,
	uuid: string,
): Promise<AgeCheckerVerificationActionResult> {
	if (!isAgeCheckerVerificationEnabled()) {
		const { server: t } = await getCheckoutServerTranslations();
		return { ok: false, error: t("agecheckerVerificationDisabled") };
	}

	try {
		const result = await getAgeCheckerVerificationStatus(uuid);
		await saveAgeCheckerMetadata(checkoutId, uuid, result.status);
		return { ok: true, uuid, status: result.status };
	} catch (error) {
		console.error("[AgeChecker] Failed to read verification status:", error);
		const { server: t } = await getCheckoutServerTranslations();
		if (error instanceof AgeCheckerApiError) {
			return { ok: false, error: error.message };
		}
		return { ok: false, error: t("agecheckerVerificationStatusFailed") };
	}
}
