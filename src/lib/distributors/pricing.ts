import { tierById, wholesaleCents, type DistributorTier, type DistributorTierId } from "./tiers";

/**
 * Which price each checkout line should carry for the buyer. Pure: sync.ts reads the checkout and the buyer's record,
 * calls this, and writes only the changes it returns.
 *
 * - An approved distributor whose cart's list-price subtotal reaches their tier's minimum gets every line at the tier's
 *   wholesale unit price (a Saleor price override, set with the distributors app's HANDLE_CHECKOUTS permission).
 * - Anyone else, or a cart below the minimum, is charged retail: any wholesale price this program set earlier is cleared.
 *
 * Each wholesale line carries a reason naming the tier and the price, so a line already at the right price is left alone
 * (running this twice changes nothing), and the program never touches a price someone else set. Saleor still applies
 * sale prices and discount codes on top of the wholesale price.
 */

/** Marks the lines whose price this program set, inside the human-readable reason Saleor stores with the price. */
const TAG = "[wv-dist:";

export type PricingLine = {
	lineId: string;
	quantity: number;
	/** The variant's list price in this checkout's channel, before tax and sales, in cents. */
	listCents: number;
	/** The reason stored with the line's current price override, if any. */
	reason: string | null;
};

export type LineUpdate = { lineId: string; price: number | null; priceOverrideReason?: string };

export type PricingPlan = {
	tier: DistributorTier | null;
	/** Whether wholesale prices apply to this cart now. */
	wholesale: boolean;
	retailSubtotalCents: number;
	/** How much more list-price value the cart needs to reach the minimum (0 once reached, or for non-distributors). */
	remainingCents: number;
	/** What the wholesale prices save on this cart (0 when they don't apply). */
	savingsCents: number;
	updates: LineUpdate[];
};

export const isDistributorReason = (reason: string | null | undefined): boolean => !!reason?.includes(TAG);

export const reasonFor = (tier: DistributorTier, unitCents: number): string =>
	`Worldwide Vapor ${tier.name}: ${tier.discountBps / 100}% off list ${TAG}${tier.id}:${tier.discountBps}:${unitCents}]`;

export function planDistributorPricing(
	lines: readonly PricingLine[],
	tierId: DistributorTierId | null,
): PricingPlan {
	const tier = tierId ? tierById(tierId) : null;
	const retailSubtotalCents = lines.reduce((sum, l) => sum + l.listCents * l.quantity, 0);
	const wholesale = !!tier && lines.length > 0 && retailSubtotalCents >= tier.minimumCents;

	const updates: LineUpdate[] = [];
	let savingsCents = 0;
	for (const line of lines) {
		if (wholesale && tier && line.listCents > 0) {
			const unit = wholesaleCents(line.listCents, tier);
			savingsCents += (line.listCents - unit) * line.quantity;
			const reason = reasonFor(tier, unit);
			if (line.reason !== reason)
				updates.push({ lineId: line.lineId, price: unit / 100, priceOverrideReason: reason });
		} else if (isDistributorReason(line.reason)) {
			updates.push({ lineId: line.lineId, price: null });
		}
	}

	return {
		tier,
		wholesale,
		retailSubtotalCents,
		remainingCents: tier && !wholesale ? Math.max(0, tier.minimumCents - retailSubtotalCents) : 0,
		savingsCents,
		updates,
	};
}
