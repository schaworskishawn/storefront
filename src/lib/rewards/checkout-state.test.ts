import { describe, expect, it } from "vitest";
import { buildCheckoutTokensState, type CheckoutTokensInput } from "./checkout-state";
import type { TokenLot } from "./lots";

const NOW = new Date("2026-10-06T15:00:00Z");

let n = 0;
const lot = (overrides: Partial<TokenLot> = {}): TokenLot => {
	n += 1;
	return {
		id: `lot-${n}`,
		currency: "CAD",
		balanceCents: 500,
		initialCents: 500,
		expiryDate: "2027-10-06",
		createdAt: "2026-09-01T00:00:00Z",
		isActive: true,
		orderId: `order-${n}`,
		...overrides,
	};
};

// A $100 order with $10 shipping and $13 tax: $123 to pay, $100 of it products.
const input = (overrides: Partial<CheckoutTokensInput> = {}): CheckoutTokensInput => ({
	now: NOW,
	currency: "CAD",
	totalCents: 12300,
	shippingCents: 1000,
	taxCents: 1300,
	subtotalCents: 10000,
	checkoutGiftCardIds: [],
	lots: [],
	tokensPerDollar: 3,
	...overrides,
});

describe("buildCheckoutTokensState", () => {
	it("shows the balance in this checkout's currency only, in tokens", () => {
		const state = buildCheckoutTokensState(
			input({
				lots: [
					lot({ balanceCents: 300 }),
					lot({ balanceCents: 450 }),
					lot({ currency: "USD", balanceCents: 9999 }),
				],
			}),
		);
		expect(state).toMatchObject({ balanceTokens: 750, balanceCents: 750 });
	});

	it("can apply tokens when there are some and something is left to pay", () => {
		expect(buildCheckoutTokensState(input({ lots: [lot()] })).canApply).toBe(true);
	});

	it("can't apply with no tokens, only expired, spent or deactivated ones, or other-currency ones", () => {
		for (const lots of [
			[],
			[lot({ expiryDate: "2026-01-01" })],
			[lot({ balanceCents: 0 })],
			[lot({ isActive: false })],
			[lot({ currency: "USD" })],
		]) {
			expect(buildCheckoutTokensState(input({ lots })).canApply).toBe(false);
		}
	});

	it("can't apply when nothing is left to pay", () => {
		expect(buildCheckoutTokensState(input({ totalCents: 0, lots: [lot()] })).canApply).toBe(false);
	});

	it("says which lots are already on the checkout and how many tokens that is, up to", () => {
		const a = lot({ balanceCents: 300 });
		const b = lot({ balanceCents: 200 });
		const c = lot({ balanceCents: 900 });
		const state = buildCheckoutTokensState(
			input({ lots: [a, b, c], checkoutGiftCardIds: [a.id, b.id, "someone-elses-gift-card"] }),
		);
		expect(state.appliedLotIds.sort()).toEqual([a.id, b.id].sort());
		expect(state.appliedTokens).toBe(500);
	});

	it("still lists an applied lot that has since expired, so it can be taken off, but doesn't count its tokens", () => {
		const expired = lot({ balanceCents: 300, expiryDate: "2026-01-01" });
		const state = buildCheckoutTokensState(input({ lots: [expired], checkoutGiftCardIds: [expired.id] }));
		expect(state.appliedLotIds).toEqual([expired.id]);
		expect(state.appliedTokens).toBe(0);
		expect(state.coversOrder).toBe(false);
	});

	it("says the order is covered once what is left to pay is nothing", () => {
		const a = lot({ balanceCents: 20000 });
		expect(
			buildCheckoutTokensState(input({ totalCents: 0, lots: [a], checkoutGiftCardIds: [a.id] })).coversOrder,
		).toBe(true);
		expect(
			buildCheckoutTokensState(input({ totalCents: 500, lots: [a], checkoutGiftCardIds: [a.id] }))
				.coversOrder,
		).toBe(false);
	});

	it("can still apply more when what is applied doesn't cover the order", () => {
		const a = lot({ balanceCents: 300 });
		const b = lot({ balanceCents: 900 });
		const state = buildCheckoutTokensState(input({ lots: [a, b], checkoutGiftCardIds: [a.id] }));
		expect(state.canApply).toBe(true);
	});

	it("has nothing more to apply once every usable lot is on the checkout", () => {
		const a = lot({ balanceCents: 300 });
		expect(buildCheckoutTokensState(input({ lots: [a], checkoutGiftCardIds: [a.id] })).canApply).toBe(false);
	});

	it("works out what the order will earn from what is paid in money, without shipping or tax", () => {
		// $100 of products at 3 tokens a dollar.
		expect(buildCheckoutTokensState(input()).willEarnTokens).toBe(300);
	});

	it("earns less when tokens cover part of the order, because only money paid earns", () => {
		// Tokens took $30 off, so $93 is left to pay: $70 of products earns 210.
		expect(buildCheckoutTokensState(input({ totalCents: 9300 })).willEarnTokens).toBe(210);
	});

	it("earns nothing when tokens cover the whole order", () => {
		expect(buildCheckoutTokensState(input({ totalCents: 0 })).willEarnTokens).toBe(0);
	});

	it("warns about tokens that are about to expire", () => {
		const state = buildCheckoutTokensState(
			input({ lots: [lot({ balanceCents: 400, expiryDate: "2026-10-20" })] }),
		);
		expect(state.expiringSoon).toEqual({ tokens: 400, firstDate: "2026-10-20" });
		expect(buildCheckoutTokensState(input({ lots: [lot()] })).expiringSoon).toBeNull();
	});
});
