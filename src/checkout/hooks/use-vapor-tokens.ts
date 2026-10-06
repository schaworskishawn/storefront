"use client";

import { useEffect, useMemo, useState } from "react";

import { getVaporTokensView } from "@/app/(checkout)/rewards-actions";
import type { ServerCheckout } from "@/checkout/lib/checkout-types";
import { toFlowCheckout } from "@/checkout/lib/vapor-tokens";
import type { TokensView } from "@/lib/rewards/checkout-flow";
import { buildCheckoutTokensState } from "@/lib/rewards/checkout-state";
import { readRewardsConfig } from "@/lib/rewards/tokens";

const NO_CARDS: ReadonlySet<string> = new Set();

type VaporTokensCheckout = {
	/** What the panel shows; null while a signed-in customer's balance is still loading. */
	view: TokensView | null;
	/** The checkout's gift cards that are really Vapor Tokens, so the gift-card list can leave them out. */
	tokenCardIds: ReadonlySet<string>;
	/** The balance is loading: the gift-card list waits, so a token lot never flashes up as a "gift card". */
	pending: boolean;
};

/**
 * The Vapor Tokens panel's data for a checkout. A guest has no tokens, so what they see (what the order would earn) is worked
 * out here; a signed-in customer's balance comes from the server, again whenever the checkout's total or gift cards change.
 */
export function useVaporTokens(checkout: ServerCheckout): VaporTokensCheckout {
	const { enabled, tokensPerDollar } = readRewardsConfig();
	const userId = checkout.user?.id ?? null;
	const checkoutId = checkout.id;
	const giftCardIds = (checkout.giftCards ?? []).map((card) => card.id).join(",");
	const total = checkout.totalPrice?.gross?.amount ?? 0;
	const [fetched, setFetched] = useState<TokensView | null>(null);

	useEffect(() => {
		if (!enabled || !userId) return;
		let cancelled = false;
		getVaporTokensView(checkoutId)
			.then((next) => {
				if (!cancelled) setFetched(next);
			})
			.catch(() => {
				if (!cancelled) setFetched({ status: "unavailable" });
			});
		return () => {
			cancelled = true;
		};
	}, [enabled, userId, checkoutId, giftCardIds, total]);

	const view = useMemo((): TokensView | null => {
		if (!enabled) return { status: "disabled" };
		if (!userId) {
			const flow = toFlowCheckout(checkout);
			const { willEarnTokens } = buildCheckoutTokensState({
				now: new Date(),
				currency: flow.currency,
				totalCents: flow.totalCents,
				shippingCents: flow.shippingCents,
				taxCents: flow.taxCents,
				subtotalCents: flow.subtotalCents,
				checkoutGiftCardIds: [],
				lots: [],
				tokensPerDollar,
			});
			return { status: "guest", willEarnTokens };
		}
		return fetched;
	}, [enabled, userId, checkout, tokensPerDollar, fetched]);

	const tokenCardIds = useMemo(
		() => (view?.status === "ready" ? new Set(view.appliedLotIds) : NO_CARDS),
		[view],
	);

	return { view, tokenCardIds, pending: enabled && Boolean(userId) && fetched === null };
}
