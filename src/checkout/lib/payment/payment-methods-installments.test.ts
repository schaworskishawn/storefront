import { describe, expect, it } from "vitest";
import { listPaymentMethods, resolvePaymentMethod } from "./payment-methods";

describe("Pay in 4 in the method list", () => {
	it("sits right after the card option, before the wallets, e-Transfer and crypto", () => {
		expect(
			listPaymentMethods({ card: true, installments: true, etransfer: true, adyen: true, crypto: true }),
		).toEqual(["card", "installments", "adyen", "etransfer", "crypto"]);
	});

	it("is left out unless offered, and an existing caller that doesn't mention it is unaffected", () => {
		expect(listPaymentMethods({ card: true, etransfer: true, adyen: false, crypto: false })).toEqual([
			"card",
			"etransfer",
		]);
		expect(
			listPaymentMethods({ card: true, installments: false, etransfer: false, adyen: false, crypto: false }),
		).toEqual(["card"]);
	});

	it("can be the only option, and is kept as the shopper's pick while it stays on offer", () => {
		expect(
			listPaymentMethods({ card: false, installments: true, etransfer: false, adyen: false, crypto: false }),
		).toEqual(["installments"]);
		expect(resolvePaymentMethod(["card", "installments"], "installments")).toBe("installments");
	});

	it("falls back to the first method when the pick is gone, e.g. the order outgrew the Pay in 4 limit", () => {
		expect(resolvePaymentMethod(["card", "etransfer"], "installments")).toBe("card");
	});
});
