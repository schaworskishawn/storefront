import { describe, expect, it } from "vitest";
import type { ServerCheckout, ServerOrder } from "@/checkout/lib/checkout-types";
import type { TokensView } from "@/lib/rewards/checkout-flow";
import {
	checkoutTokensView,
	estimateOrderTokens,
	toFlowCheckout,
	type CheckoutTokensViewInput,
} from "./vapor-tokens";

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

describe("checkoutTokensView", () => {
	const ready: TokensView = {
		status: "ready",
		currency: "CAD",
		balanceTokens: 0,
		balanceCents: 0,
		appliedLotIds: [],
		appliedTokens: 0,
		coversOrder: false,
		canApply: false,
		expiringSoon: null,
		willEarnTokens: 45,
	};

	const input = (overrides: Partial<CheckoutTokensViewInput> = {}): CheckoutTokensViewInput => ({
		enabled: true,
		tokensPerDollar: 3,
		sessionUserId: "user-1",
		checkout: checkout(),
		fetched: null,
		now: new Date("2026-11-24T12:00:00Z"),
		...overrides,
	});

	it("is off when the program is off", () => {
		expect(checkoutTokensView(input({ enabled: false }))).toEqual({ status: "disabled" });
	});

	it("shows a guest what the order would earn", () => {
		// $15 of products at 3 tokens a dollar.
		expect(checkoutTokensView(input({ sessionUserId: null, checkout: checkout({ user: null }) }))).toEqual({
			status: "guest",
			willEarnTokens: 45,
		});
	});

	it("treats a signed-in customer as signed in before Saleor attaches them to the checkout", () => {
		// The checkout was started as a guest, so it has no customer yet; the session says who is signed in.
		const unattached = checkout({ user: null });
		// Loading the balance, not the guest "Sign in to earn" copy.
		expect(checkoutTokensView(input({ checkout: unattached }))).toBeNull();
		expect(
			checkoutTokensView(input({ checkout: unattached, fetched: { userId: "user-1", view: ready } })),
		).toBe(ready);
	});

	it("goes by the session, not the checkout's customer, for a guest", () => {
		// Signed out since the checkout was attached: the session wins, so no balance is shown.
		expect(
			checkoutTokensView(input({ sessionUserId: null, fetched: { userId: "user-1", view: ready } })),
		).toEqual({ status: "guest", willEarnTokens: 45 });
	});

	it("waits for the signed-in customer's own view, not one read for someone else", () => {
		expect(
			checkoutTokensView(input({ sessionUserId: "user-2", fetched: { userId: "user-1", view: ready } })),
		).toBeNull();
	});

	it("shows what the server returned for the signed-in customer", () => {
		const unavailable: TokensView = { status: "unavailable" };
		expect(checkoutTokensView(input({ fetched: { userId: "user-1", view: unavailable } }))).toBe(unavailable);
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
