import "server-only";

import {
	CheckoutDocument,
	type CheckoutQuery,
	type CheckoutQueryVariables,
} from "@/checkout/graphql/generated/operations";
import type { CheckoutFetchResult } from "@/checkout/lib/checkout-types";
import { toTypedDocument } from "@/checkout/lib/server/to-typed-document";
import { syncDistributorPricing } from "@/lib/distributors/sync";
import { executePublicGraphQL } from "@/lib/graphql";
import { checkoutGraphqlLocaleVariables } from "@/lib/checkout-locale";
import type { LocaleSlug } from "@/config/locale";

const checkoutQueryDocument = toTypedDocument<CheckoutQuery, CheckoutQueryVariables>(CheckoutDocument);

/**
 * Fetch checkout for the checkout RSC page (public — checkout ID is the credential).
 *
 * The checkout ID is the credential — no customer session or app token.
 *
 * Every server read of the checkout (its page, live refreshes, the total checked before a payment starts) first brings its
 * prices in line with the buyer's distributor tier, so what's shown and what's charged is the price they earn now.
 */
export async function fetchCheckoutOnServer(
	checkoutId: string,
	localeSlug?: LocaleSlug,
): Promise<CheckoutFetchResult> {
	await syncDistributorPricing(checkoutId);
	const result = await executePublicGraphQL(checkoutQueryDocument, {
		variables: { id: checkoutId, ...(await checkoutGraphqlLocaleVariables(localeSlug)) },
		cache: "no-cache",
	});

	if (!result.ok) {
		if (process.env.NODE_ENV === "development") {
			console.error(
				"[fetchCheckoutOnServer] failed:",
				result.error.type,
				result.error.message || "(no message)",
				{ checkoutId },
			);
		}
		return { ok: false };
	}

	return { ok: true, checkout: result.data.checkout ?? null };
}
