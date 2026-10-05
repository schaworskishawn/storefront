import { describe, expect, it } from "vitest";
import {
	WVPAY_GATEWAY_ID,
	findWvPayGateway,
	isWvPayCryptoRequest,
	isWvPayGateway,
	parseWvPayGatewayConfig,
	wvPayOffersCrypto,
} from "./wvpay";

describe("wvpay gateway identity", () => {
	it("matches the Saleor app's gateway id", () => {
		expect(WVPAY_GATEWAY_ID).toBe("app.worldwide-vapor.payments");
		expect(isWvPayGateway("app.worldwide-vapor.payments")).toBe(true);
		expect(isWvPayGateway("saleor.app.payment.stripe")).toBe(false);
	});

	it("finds the gateway among others", () => {
		const gateways = [
			{ id: "saleor.app.payment.stripe", name: "Stripe" },
			{ id: WVPAY_GATEWAY_ID, name: "Worldwide Vapor Payments" },
		];
		expect(findWvPayGateway(gateways)?.name).toBe("Worldwide Vapor Payments");
		expect(findWvPayGateway([])).toBeUndefined();
		expect(findWvPayGateway(null)).toBeUndefined();
	});
});

describe("isWvPayCryptoRequest", () => {
	it("recognises only the crypto method", () => {
		expect(isWvPayCryptoRequest({ method: "crypto", returnUrl: "https://shop.example/checkout" })).toBe(true);
		expect(isWvPayCryptoRequest({ method: "authorizenet" })).toBe(false);
		expect(isWvPayCryptoRequest({})).toBe(false);
		expect(isWvPayCryptoRequest(null)).toBe(false);
		expect(isWvPayCryptoRequest("crypto")).toBe(false);
	});
});

describe("parseWvPayGatewayConfig", () => {
	it("reads the methods the app offers", () => {
		expect(parseWvPayGatewayConfig({ methods: ["crypto"], crypto: { provider: "nowpayments" } })).toEqual({
			methods: ["crypto"],
		});
		expect(parseWvPayGatewayConfig({ methods: [] })).toEqual({ methods: [] });
	});

	it("ignores anything that is not a string method", () => {
		expect(parseWvPayGatewayConfig({ methods: ["crypto", 7, null] })).toEqual({ methods: ["crypto"] });
		expect(parseWvPayGatewayConfig({ methods: "crypto" })).toEqual({ methods: [] });
		expect(parseWvPayGatewayConfig({})).toEqual({ methods: [] });
	});

	it("rejects non-objects", () => {
		expect(parseWvPayGatewayConfig(null)).toBeNull();
		expect(parseWvPayGatewayConfig("text")).toBeNull();
	});
});

describe("wvPayOffersCrypto", () => {
	it("is true only when crypto is listed", () => {
		expect(wvPayOffersCrypto({ methods: ["crypto"] })).toBe(true);
		expect(wvPayOffersCrypto({ methods: [] })).toBe(false);
		expect(wvPayOffersCrypto(null)).toBe(false);
	});
});
