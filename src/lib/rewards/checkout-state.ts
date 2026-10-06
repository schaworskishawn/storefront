import {
	balanceFor,
	expiringSoon,
	isUsable,
	planApplication,
	type ExpiringSoon,
	type TokenLot,
} from "./lots";
import { earnBaseCents, tokensForCents, tokensInCents } from "./tokens";

/**
 * What the checkout's Vapor Tokens panel shows, worked out from a customer's lots and the checkout's amounts. Pure, so the
 * numbers a shopper sees (what they can spend, what is already on this order, what the order will earn) are unit-tested.
 */

export type CheckoutTokensInput = {
	now: Date;
	currency: string;
	/** What is still to pay: Saleor has already taken anything applied (tokens, gift cards) off it. */
	totalCents: number;
	shippingCents: number;
	taxCents: number;
	subtotalCents: number;
	/** The ids of the gift cards on this checkout. Token lots among them are "applied". */
	checkoutGiftCardIds: readonly string[];
	lots: readonly TokenLot[];
	tokensPerDollar: number;
};

export type CheckoutTokensState = {
	/** Every token the customer can spend in this checkout's currency, applied ones included. */
	balanceTokens: number;
	balanceCents: number;
	/** The token lots on this checkout, spendable or not: the checkout screen hides these from its gift-card list. */
	appliedLotIds: string[];
	/** The tokens on this checkout that can still be spent. They are all used unless the order is covered first. */
	appliedTokens: number;
	/** The tokens on this checkout pay the whole order, so only part of them will be spent. */
	coversOrder: boolean;
	/** Can tokens be applied now: there are unapplied tokens and something left to pay. */
	canApply: boolean;
	expiringSoon: ExpiringSoon | null;
	/** What this order will earn once it is paid, counting only what is paid in money. */
	willEarnTokens: number;
};

export function buildCheckoutTokensState(input: CheckoutTokensInput): CheckoutTokensState {
	const { now, currency, lots } = input;
	const applied = new Set(input.checkoutGiftCardIds);

	const appliedLots = lots.filter((lot) => applied.has(lot.id));
	const spendable = appliedLots.filter(
		(lot) => lot.currency === currency.toUpperCase() && isUsable(lot, now),
	);
	const appliedCents = spendable.reduce((sum, lot) => sum + lot.balanceCents, 0);
	const balance = balanceFor(lots, now, currency);

	return {
		balanceTokens: balance.tokens,
		balanceCents: balance.cents,
		appliedLotIds: appliedLots.map((lot) => lot.id),
		appliedTokens: tokensInCents(appliedCents),
		coversOrder: appliedCents > 0 && input.totalCents <= 0,
		canApply: planApplication(lots, now, currency, input.totalCents, applied).lots.length > 0,
		expiringSoon: expiringSoon(lots, now, currency),
		willEarnTokens: tokensForCents(
			earnBaseCents({
				chargedCents: input.totalCents,
				shippingCents: input.shippingCents,
				taxCents: input.taxCents,
				subtotalCents: input.subtotalCents,
			}),
			input.tokensPerDollar,
		),
	};
}
