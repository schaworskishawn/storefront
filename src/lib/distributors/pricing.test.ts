import { describe, expect, it } from "vitest";
import { isDistributorReason, planDistributorPricing, reasonFor, type PricingLine } from "./pricing";
import { DISTRIBUTOR_TIERS, discountLabel, minimumLabel, tierById, wholesaleCents } from "./tiers";

const line = (
	lineId: string,
	listCents: number,
	quantity: number,
	reason: string | null = null,
): PricingLine => ({
	lineId,
	listCents,
	quantity,
	reason,
});

describe("the distributor tiers", () => {
	it("are 5% to 25% off with minimums from $250 to $10,000", () => {
		expect(DISTRIBUTOR_TIERS.map((t) => `${discountLabel(t)} ${minimumLabel(t)}`)).toEqual([
			"5% $250",
			"10% $500",
			"15% $1,000",
			"20% $2,500",
			"25% $10,000",
		]);
	});

	it("round the wholesale unit price to the cent", () => {
		expect(wholesaleCents(1499, tierById("authorized"))).toBe(1274); // 1274.15
		expect(wholesaleCents(1999, tierById("small"))).toBe(1899); // 1899.05
		expect(wholesaleCents(2999, tierById("master"))).toBe(2249); // 2249.25
		expect(wholesaleCents(5, tierById("partner"))).toBe(5); // 4.5 rounds up
	});
});

describe("planning a cart's prices", () => {
	it("prices every line at wholesale once the list-price subtotal reaches the minimum", () => {
		const plan = planDistributorPricing([line("a", 1499, 50), line("b", 2999, 10)], "authorized");
		expect(plan.retailSubtotalCents).toBe(1499 * 50 + 2999 * 10); // $1,049.40
		expect(plan.wholesale).toBe(true);
		expect(plan.remainingCents).toBe(0);
		expect(plan.updates).toEqual([
			{ lineId: "a", price: 12.74, priceOverrideReason: reasonFor(tierById("authorized"), 1274) },
			{ lineId: "b", price: 25.49, priceOverrideReason: reasonFor(tierById("authorized"), 2549) },
		]);
		expect(plan.savingsCents).toBe((1499 - 1274) * 50 + (2999 - 2549) * 10);
	});

	it("counts the minimum exactly: $250.00 qualifies, $249.99 doesn't", () => {
		expect(planDistributorPricing([line("a", 25_000, 1)], "small").wholesale).toBe(true);
		const below = planDistributorPricing([line("a", 24_999, 1)], "small");
		expect(below.wholesale).toBe(false);
		expect(below.remainingCents).toBe(1);
		expect(below.updates).toEqual([]);
		expect(below.savingsCents).toBe(0);
	});

	it("puts a cart that drops below the minimum back to retail", () => {
		const reason = reasonFor(tierById("partner"), 900);
		const plan = planDistributorPricing([line("a", 1000, 3, reason)], "partner");
		expect(plan.wholesale).toBe(false);
		expect(plan.remainingCents).toBe(50_000 - 3000);
		expect(plan.updates).toEqual([{ lineId: "a", price: null }]);
	});

	it("changes nothing when every line already carries the right price", () => {
		const tier = tierById("regional");
		const lines = [line("a", 10_000, 20, reasonFor(tier, 8000)), line("b", 5_000, 20, reasonFor(tier, 4000))];
		const plan = planDistributorPricing(lines, "regional");
		expect(plan.wholesale).toBe(true);
		expect(plan.updates).toEqual([]);
		expect(plan.savingsCents).toBe(2000 * 20 + 1000 * 20);
	});

	it("reprices a line when the tier or the list price changed", () => {
		const old = reasonFor(tierById("small"), 950);
		const plan = planDistributorPricing([line("a", 1000, 100, old)], "partner");
		expect(plan.updates).toEqual([
			{ lineId: "a", price: 9, priceOverrideReason: reasonFor(tierById("partner"), 900) },
		]);
	});

	it("clears only its own prices for a customer who isn't a distributor (or no longer is)", () => {
		const ours = reasonFor(tierById("small"), 950);
		const plan = planDistributorPricing(
			[line("a", 1000, 1, ours), line("b", 1000, 1, "Price match for a loyal customer"), line("c", 1000, 1)],
			null,
		);
		expect(plan.tier).toBeNull();
		expect(plan.wholesale).toBe(false);
		expect(plan.remainingCents).toBe(0);
		expect(plan.updates).toEqual([{ lineId: "a", price: null }]);
	});

	it("leaves free lines alone and never sets a price on an empty cart", () => {
		const plan = planDistributorPricing([line("free", 0, 1), line("a", 30_000, 1)], "small");
		expect(plan.wholesale).toBe(true);
		expect(plan.updates.map((u) => u.lineId)).toEqual(["a"]);
		expect(planDistributorPricing([], "small")).toMatchObject({ wholesale: false, updates: [] });
	});

	it("recognises its own reasons", () => {
		expect(isDistributorReason(reasonFor(tierById("master"), 100))).toBe(true);
		expect(isDistributorReason("Manual adjustment")).toBe(false);
		expect(isDistributorReason(null)).toBe(false);
	});
});
