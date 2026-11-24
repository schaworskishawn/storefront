"use client";

import { useEffect, useMemo, useState } from "react";

import { getVaporTokensView } from "@/app/(checkout)/rewards-actions";
import { useUser } from "@/checkout/hooks/use-user";
import type { ServerCheckout } from "@/checkout/lib/checkout-types";
import { checkoutTokensView, type FetchedTokensView } from "@/checkout/lib/vapor-tokens";
import type { TokensView } from "@/lib/rewards/checkout-flow";
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
 * Signed in means the session, the same as the contact step, not whether the checkout has a customer on it yet.
 */
export function useVaporTokens(checkout: ServerCheckout): VaporTokensCheckout {
	const { enabled, tokensPerDollar } = readRewardsConfig();
	const { user } = useUser();
	const userId = user?.id ?? null;
	const checkoutId = checkout.id;
	const giftCardIds = (checkout.giftCards ?? []).map((card) => card.id).join(",");
	const total = checkout.totalPrice?.gross?.amount ?? 0;
	const [fetched, setFetched] = useState<FetchedTokensView | null>(null);

	useEffect(() => {
		if (!enabled || !userId) return;
		let cancelled = false;
		getVaporTokensView(checkoutId)
			.then((view) => {
				if (!cancelled) setFetched({ userId, view });
			})
			.catch(() => {
				if (!cancelled) setFetched({ userId, view: { status: "unavailable" } });
			});
		return () => {
			cancelled = true;
		};
	}, [enabled, userId, checkoutId, giftCardIds, total]);

	const view = useMemo(
		() =>
			checkoutTokensView({
				enabled,
				tokensPerDollar,
				sessionUserId: userId,
				checkout,
				fetched,
				now: new Date(),
			}),
		[enabled, tokensPerDollar, userId, checkout, fetched],
	);

	const tokenCardIds = useMemo(
		() => (view?.status === "ready" ? new Set(view.appliedLotIds) : NO_CARDS),
		[view],
	);

	return { view, tokenCardIds, pending: view === null };
}
