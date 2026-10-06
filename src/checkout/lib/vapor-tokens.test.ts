import { describe, expect, it } from "vitest";
import type { ServerCheckout, ServerOrder } from "@/checkout/lib/checkout-types";
import { estimateOrderTokens, toFlowCheckout } from "./vapor-tokens";

const money = (amount: number, currency = "CAD") => ({ amount, currency });

const checkout = (overrides: Record<string, unknown> = {}) =>
	({
		id: "checkout-1",
		totalPrice: { gross: money(23), tax: money(3) },
		shippingPrice: { gross: money(5) },
		subtotalPrice: { gross: money(15) },
		user: { id: "user-1" },
		giftCards: [{ id: "gc-1" }, { id: "gc-2" }],
		...overrides,
	}) as unknown as ServerCheckout;

const order = (overrides: Record<string, unknown> = {}) =>
	({
		isPaid: false,
		total: { gross: money(23), tax: money(3) },
		shippingPrice: { gross: money(5) },
		subtotal: { gross: money(15) },
		totalCaptured: money(0),
		...overrides,
	}) as unknown as ServerOrder;

describe("toFlowCheckout", () => {
	it("reads amounts in whole cents and the customer and gift cards", () => {
		expect(toFlowCheckout(checkout())).toEqual({
			id: "checkout-1",
			currency: "CAD",
			totalCents: 2300,
			shippingCents: 500,
			taxCents: 300,
			subtotalCents: 1500,
			userId: "user-1",
			giftCardIds: ["gc-1", "gc-2"],
		});
	});

	it("rounds away float noise from Saleor's decimal amounts", () => {
		expect(
			toFlowCheckout(checkout({ totalPrice: { gross: money(19.99 + 0.01), tax: money(0) } })).totalCents,
		).toBe(2000);
		expect(toFlowCheckout(checkout({ subtotalPrice: { gross: money(0.29) } })).subtotalCents).toBe(29);
	});

	it("copes with a guest checkout with nothing yet", () => {
		expect(
			toFlowCheckout(
				checkout({ user: null, giftCards: null, shippingPrice: null, totalPrice: null, subtotalPrice: null }),
			),
		).toMatchObject({
			userId: null,
			giftCardIds: [],
			shippingCents: 0,
			totalCents: 0,
			subtotalCents: 0,
			currency: "",
		});
	});
});

describe("estimateOrderTokens", () => {
	it("earns on the products of an unpaid order's full total, not shipping or tax", () => {
		// $15 of products at 3 tokens a dollar.
		expect(estimateOrderTokens(order(), 3)).toBe(45);
	});

	it("earns on what was charged once the order is paid", () => {
		// Paid in money: $23 charged, so the same $15 of products.
		expect(estimateOrderTokens(order({ isPaid: true, totalCaptured: money(23) }), 3)).toBe(45);
		// Tokens or a gift card covered $10: only $13 was charged, $5 shipping and $3 tax come off it, leaving $5 of products.
		expect(estimateOrderTokens(order({ isPaid: true, totalCaptured: money(13) }), 3)).toBe(15);
	});

	it("earns nothing when tokens or a gift card covered the whole order", () => {
		expect(estimateOrderTokens(order({ isPaid: true, totalCaptured: money(0) }), 3)).toBe(0);
	});

	it("follows the configured rate", () => {
		expect(estimateOrderTokens(order(), 5)).toBe(75);
	});
});
