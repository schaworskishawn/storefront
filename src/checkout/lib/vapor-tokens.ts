import type { ServerCheckout, ServerOrder } from "@/checkout/lib/checkout-types";
import type { FlowCheckout } from "@/lib/rewards/checkout-flow";
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
