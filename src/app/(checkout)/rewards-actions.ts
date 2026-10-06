"use server";

import {
	UserDocument,
	type UserQuery,
	type UserQueryVariables,
} from "@/checkout/graphql/generated/operations";
import type { CheckoutActionResult } from "@/checkout/lib/checkout-action-types";
import type { ServerCheckout } from "@/checkout/lib/checkout-types";
import { fetchCheckoutOnServer } from "@/checkout/lib/server/fetch-checkout";
import { toTypedDocument } from "@/checkout/lib/server/to-typed-document";
import { toFlowCheckout } from "@/checkout/lib/vapor-tokens";
import { executeAuthenticatedGraphQL } from "@/lib/graphql";
import {
	applyTokens,
	readTokensView,
	removeTokens,
	type Changed,
	type FlowDeps,
	type Outcome,
	type TokensResult,
	type TokensView,
} from "@/lib/rewards/checkout-flow";
import { listLots, readLotCode } from "@/lib/rewards/saleor-rewards";
import { readRewardsConfig } from "@/lib/rewards/tokens";
import { applyCheckoutPromoCode, attachCustomerToCheckout, removeCheckoutGiftCard } from "./actions";

/**
 * Vapor Tokens at checkout. The rules are in `@/lib/rewards/checkout-flow`; this file only connects them to the checkout,
 * the customer's session and Saleor. A lot's gift-card code is read here, on the server, and goes straight to Saleor: it is
 * never part of anything returned to the browser.
 */

const userDocument = toTypedDocument<UserQuery, UserQueryVariables>(UserDocument);

function changed(result: CheckoutActionResult): Outcome<Changed<ServerCheckout>> {
	if (result.ok)
		return { ok: true, value: { checkout: result.checkout, flow: toFlowCheckout(result.checkout) } };
	return {
		ok: false,
		message: result.error ?? result.fieldErrors?.[0]?.message ?? "Saleor refused the change.",
	};
}

const deps: FlowDeps<ServerCheckout> = {
	now: () => new Date(),
	get config() {
		return readRewardsConfig();
	},
	checkout: async (checkoutId) => {
		const result = await fetchCheckoutOnServer(checkoutId);
		return result.ok && result.checkout ? toFlowCheckout(result.checkout) : null;
	},
	userId: async () => {
		const result = await executeAuthenticatedGraphQL(userDocument, { cache: "no-cache" });
		return result.ok ? (result.data.user?.id ?? null) : null;
	},
	lots: (userId, withCode) => listLots(userId, { withCode }),
	readCode: (lotId) => readLotCode(lotId),
	attach: async (checkoutId) => changed(await attachCustomerToCheckout(checkoutId)),
	apply: async (checkoutId, code) => changed(await applyCheckoutPromoCode(checkoutId, code)),
	remove: async (checkoutId, giftCardId) => changed(await removeCheckoutGiftCard(checkoutId, giftCardId)),
	report: (message) => console.error(`[rewards] ${message}`),
};

/** What the checkout's Vapor Tokens panel shows: the customer's balance, what is applied, what the order earns. */
export async function getVaporTokensView(checkoutId: string): Promise<TokensView> {
	return readTokensView(checkoutId, deps);
}

/** Puts the signed-in customer's tokens on the checkout, soonest-expiring first, as many as the order needs. */
export async function applyVaporTokens(checkoutId: string): Promise<TokensResult<ServerCheckout>> {
	return applyTokens(checkoutId, deps);
}

/** Takes the customer's tokens off the checkout. */
export async function removeVaporTokens(checkoutId: string): Promise<TokensResult<ServerCheckout>> {
	return removeTokens(checkoutId, deps);
}
