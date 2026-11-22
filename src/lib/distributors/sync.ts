import "server-only";

import { planDistributorPricing, type PricingPlan } from "./pricing";
import { activeTierId } from "./records";
import {
	fetchPricingCheckout,
	isDistributorAppConfigured,
	setCheckoutLinePrices,
	type PricingCheckout,
	type Result,
} from "./saleor-distributors";

/**
 * Brings a checkout's prices in line with its buyer: wholesale for an approved distributor whose cart reaches their
 * tier's minimum, retail otherwise. Called after every cart change, whenever the checkout is read on the server (its
 * page, live refreshes, payment starts) and right before an order is completed, so the price paid is always the one
 * the buyer's tier earns at that moment.
 *
 * The buyer is the customer attached to the checkout (a signed-in customer's checkout is theirs), never a cookie or a
 * public field. Best effort: if Saleor can't be reached, the checkout is left as it was and the failure is logged.
 * Returns the plan (for the cart page's banner), or null when the program isn't set up or the checkout is gone.
 */

export type SyncDeps = {
	configured: boolean;
	fetch: (checkoutId: string) => Promise<Result<PricingCheckout | null>>;
	setPrices: typeof setCheckoutLinePrices;
};

const productionDeps = (): SyncDeps => ({
	configured: isDistributorAppConfigured(),
	fetch: (id) => fetchPricingCheckout(id),
	setPrices: (id, updates) => setCheckoutLinePrices(id, updates),
});

export async function syncDistributorPricing(
	checkoutId: string | null | undefined,
	deps: SyncDeps = productionDeps(),
): Promise<PricingPlan | null> {
	if (!checkoutId || !deps.configured) return null;
	const read = await deps.fetch(checkoutId);
	if (!read.ok) {
		console.warn(`[distributors] couldn't read checkout ${checkoutId} for pricing: ${read.message}`);
		return null;
	}
	if (!read.value) return null;
	const plan = planDistributorPricing(read.value.lines, activeTierId(read.value.record));
	if (plan.updates.length > 0) {
		const saved = await deps.setPrices(checkoutId, plan.updates);
		if (!saved.ok) {
			console.error(`[distributors] couldn't set prices on checkout ${checkoutId}: ${saved.message}`);
			return { ...plan, updates: [] };
		}
	}
	return plan;
}
