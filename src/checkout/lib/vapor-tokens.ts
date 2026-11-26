import type { ServerCheckout, ServerOrder } from "@/checkout/lib/checkout-types";
import type { FlowCheckout, TokensView } from "@/lib/rewards/checkout-flow";
import { buildCheckoutTokensState } from "@/lib/rewards/checkout-state";
import { earnBaseCents, tokensForCents } from "@/lib/rewards/tokens";

const cents = (amount: number | null | undefined) => Math.round((amount ?? 0) * 100);

/** The amounts and ids of a checkout that Vapor Tokens care about, in whole cents. Used by the server action and the browser. */
export function toFlowCheckout(checkout: ServerCheckout): FlowCheckout {
	return {
		id: checkout.id,
		currency: (checkout.totalPrice?.gross?.currency ?? "").toUpperCase(),
		totalCents: cents(checkout.totalPrice?.gross?.amount),
		shippingCents: cents(checkout.shippingPrice?.gross?.amount),
		taxCents: cents(checkout.totalPrice?.tax?.amount),
		subtotalCents: cents(checkout.subtotalPrice?.gross?.amount),
		userId: checkout.user?.id ?? null,
		giftCardIds: (checkout.giftCards ?? []).map((card) => card.id),
	};
}

/** A signed-in customer's tokens view as the server returned it, and which customer it was read for. */
export type FetchedTokensView = { userId: string; view: TokensView };

export type CheckoutTokensViewInput = {
	enabled: boolean;
	tokensPerDollar: number;
	/** The signed-in customer's id from the session (what the contact step shows), or null for a guest. */
	sessionUserId: string | null;
	checkout: ServerCheckout;
	/** The server's view for a signed-in customer, once it has come back. */
	fetched: FetchedTokensView | null;
	now: Date;
};

/**
 * What the checkout's Vapor Tokens panel shows, or null while a signed-in customer's balance is still loading.
 *
 * Whether the shopper is signed in comes from the session, never from `checkout.user`. A checkout started before signing in
 * has no customer on it until Saleor attaches one, which happens after the page loads and can fail; going by it showed a
 * signed-in customer "Sign in to earn…". The server reads the session too, and attaches the customer when tokens are used.
 */
export function checkoutTokensView(input: CheckoutTokensViewInput): TokensView | null {
	if (!input.enabled) return { status: "disabled" };
	if (!input.sessionUserId) {
		// A guest has no tokens, so only what the order would earn, worked out here without asking the server.
		const flow = toFlowCheckout(input.checkout);
		const { willEarnTokens } = buildCheckoutTokensState({
			now: input.now,
			currency: flow.currency,
			totalCents: flow.totalCents,
			shippingCents: flow.shippingCents,
			taxCents: flow.taxCents,
			subtotalCents: flow.subtotalCents,
			checkoutGiftCardIds: [],
			lots: [],
			tokensPerDollar: input.tokensPerDollar,
		});
		return { status: "guest", willEarnTokens };
	}
	// A view read for another customer (the session changed since) is not this one's: wait for theirs.
	return input.fetched?.userId === input.sessionUserId ? input.fetched.view : null;
}

/**
 * About how many tokens an order earns once it is paid, for the confirmation page. A paid order earns on what was actually
 * charged (tokens and gift cards that covered part of it earn nothing); an unpaid or part-paid one (Interac e-Transfer, Pay in 4)
 * on its full total, since that is what will be paid in money.
 */
export function estimateOrderTokens(order: ServerOrder, tokensPerDollar: number): number {
	return tokensForCents(
		earnBaseCents({
			chargedCents: cents(order.isPaid ? order.totalCaptured?.amount : order.total?.gross?.amount),
			shippingCents: cents(order.shippingPrice?.gross?.amount),
			taxCents: cents(order.total?.tax?.amount),
			subtotalCents: cents(order.subtotal?.gross?.amount),
		}),
		tokensPerDollar,
	);
}
