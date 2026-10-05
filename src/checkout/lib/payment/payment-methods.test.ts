import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getGatewayPaymentOffers,
	isExtraMethodGateway,
	listPaymentMethods,
	resolvePaymentMethod,
} from "./payment-methods";
import { resolvePaymentProvider } from "./resolve-provider";

const ADYEN = { id: "app.saleor.adyen", name: "Adyen" };
const WVPAY = { id: "app.worldwide-vapor.payments", name: "Worldwide Vapor Payments" };
const STRIPE = { id: "saleor.app.payment.stripe", name: "Stripe" };

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("listPaymentMethods", () => {
	it("orders the methods that are on offer", () => {
		expect(listPaymentMethods({ card: true, etransfer: true, adyen: true, crypto: true })).toEqual([
			"card",
			"adyen",
			"etransfer",
			"crypto",
		]);
		expect(listPaymentMethods({ card: false, etransfer: true, adyen: false, crypto: true })).toEqual([
			"etransfer",
			"crypto",
		]);
		expect(listPaymentMethods({ card: false, etransfer: false, adyen: false, crypto: false })).toEqual([]);
	});
});

describe("resolvePaymentMethod", () => {
	it("keeps the shopper's pick while it is on offer", () => {
		expect(resolvePaymentMethod(["card", "crypto"], "crypto")).toBe("crypto");
	});

	it("falls back to the first available method when the pick is gone", () => {
		expect(resolvePaymentMethod(["etransfer", "crypto"], "card")).toBe("etransfer");
		expect(resolvePaymentMethod(["card", "adyen"], "etransfer")).toBe("card");
	});

	it("stays on card when nothing is on offer so the gateway alerts still show", () => {
		expect(resolvePaymentMethod([], "crypto")).toBe("card");
	});
});

describe("getGatewayPaymentOffers", () => {
	it("offers nothing extra by default, even when the gateways are present", () => {
		expect(getGatewayPaymentOffers([ADYEN, WVPAY], false)).toEqual({ adyen: false, crypto: false });
	});

	it("needs both the flag and the gateway", () => {
		vi.stubEnv("NEXT_PUBLIC_ENABLE_ADYEN_PAYMENTS", "true");
		vi.stubEnv("NEXT_PUBLIC_ENABLE_CRYPTO_PAYMENTS", "true");
		expect(getGatewayPaymentOffers([ADYEN, WVPAY], false)).toEqual({ adyen: true, crypto: true });
		expect(getGatewayPaymentOffers([STRIPE], false)).toEqual({ adyen: false, crypto: false });
		expect(getGatewayPaymentOffers([WVPAY], false)).toEqual({ adyen: false, crypto: true });
		expect(getGatewayPaymentOffers(null, false)).toEqual({ adyen: false, crypto: false });
	});

	it("offers nothing on a free order", () => {
		vi.stubEnv("NEXT_PUBLIC_ENABLE_ADYEN_PAYMENTS", "true");
		vi.stubEnv("NEXT_PUBLIC_ENABLE_CRYPTO_PAYMENTS", "true");
		expect(getGatewayPaymentOffers([ADYEN, WVPAY], true)).toEqual({ adyen: false, crypto: false });
	});
});

describe("isExtraMethodGateway", () => {
	it("recognises the gateways behind the extra methods only while their flags are on", () => {
		expect(isExtraMethodGateway(ADYEN)).toBe(false);
		vi.stubEnv("NEXT_PUBLIC_ENABLE_ADYEN_PAYMENTS", "true");
		expect(isExtraMethodGateway(ADYEN)).toBe(true);
		expect(isExtraMethodGateway(WVPAY)).toBe(false);
		vi.stubEnv("NEXT_PUBLIC_ENABLE_CRYPTO_PAYMENTS", "true");
		expect(isExtraMethodGateway(WVPAY)).toBe(true);
		expect(isExtraMethodGateway(STRIPE)).toBe(false);
	});
});

describe("resolvePaymentProvider with extra-method gateways", () => {
	it("flags Adyen as unsupported until its flag is on", () => {
		expect(resolvePaymentProvider([ADYEN]).type).toBe("unsupported");
		vi.stubEnv("NEXT_PUBLIC_ENABLE_ADYEN_PAYMENTS", "true");
		expect(resolvePaymentProvider([ADYEN]).type).toBe("none");
	});

	it("keeps the card gateway as the provider when Adyen sits beside it", () => {
		vi.stubEnv("NEXT_PUBLIC_ENABLE_ADYEN_PAYMENTS", "true");
		vi.stubEnv("NEXT_PUBLIC_ENABLE_STRIPE_PAYMENTS", "true");
		expect(resolvePaymentProvider([ADYEN, STRIPE]).type).toBe("stripe");
	});

	it("lets crypto run on the payments app without it ever being the primary card gateway", () => {
		vi.stubEnv("NEXT_PUBLIC_ENABLE_CRYPTO_PAYMENTS", "true");
		expect(resolvePaymentProvider([WVPAY]).type).toBe("none");
	});

	it("keeps the card gateway as the provider when the payments app sits beside it", () => {
		vi.stubEnv("NEXT_PUBLIC_ENABLE_CRYPTO_PAYMENTS", "true");
		vi.stubEnv("NEXT_PUBLIC_ENABLE_STRIPE_PAYMENTS", "true");
		expect(resolvePaymentProvider([WVPAY, STRIPE]).type).toBe("stripe");
	});
});
