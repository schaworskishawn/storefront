import { afterEach, describe, expect, it, vi } from "vitest";
import {
	ADYEN_GATEWAY_ID,
	allowedAdyenPaymentMethods,
	classifyAdyenResponse,
	DEFAULT_ADYEN_PAYMENT_METHODS,
	findAdyenGateway,
	getAdyenGuardError,
	isAdyenEnabled,
	parseAdyenDetailsResponse,
	parseAdyenGatewayConfig,
	parseAdyenPaymentResponse,
	resolveAdyenEnvironment,
	toAdyenLocale,
	toMinorUnits,
} from "./adyen";

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("Adyen enablement", () => {
	it("is off unless a flag is set — there is no development default", () => {
		vi.stubEnv("NODE_ENV", "development");
		expect(isAdyenEnabled()).toBe(false);
		vi.stubEnv("NEXT_PUBLIC_ENABLE_ADYEN_PAYMENTS", "true");
		expect(isAdyenEnabled()).toBe(true);
	});

	it("also honours the server-only flag", () => {
		vi.stubEnv("ENABLE_ADYEN_PAYMENTS", "true");
		expect(isAdyenEnabled()).toBe(true);
	});

	it("guards only its own gateway", () => {
		expect(getAdyenGuardError("saleor.app.payment.stripe")).toBeNull();
		expect(getAdyenGuardError(null)).toBeNull();
		expect(getAdyenGuardError(ADYEN_GATEWAY_ID)).toMatch(/NEXT_PUBLIC_ENABLE_ADYEN_PAYMENTS/);
		vi.stubEnv("NEXT_PUBLIC_ENABLE_ADYEN_PAYMENTS", "true");
		expect(getAdyenGuardError(ADYEN_GATEWAY_ID)).toBeNull();
	});

	it("finds the gateway on a checkout", () => {
		const gateways = [
			{ id: "app.worldwide-vapor.payments", name: "WV" },
			{ id: ADYEN_GATEWAY_ID, name: "Adyen" },
		];
		expect(findAdyenGateway(gateways)?.name).toBe("Adyen");
		expect(findAdyenGateway([])).toBeUndefined();
		expect(findAdyenGateway(null)).toBeUndefined();
	});
});

describe("allowedAdyenPaymentMethods", () => {
	it("defaults to PayPal and the buy-now-pay-later lenders, never cards", () => {
		const methods = allowedAdyenPaymentMethods(undefined);
		expect(methods).toEqual([...DEFAULT_ADYEN_PAYMENT_METHODS]);
		expect(methods).toContain("paypal");
		expect(methods).toContain("klarna");
		expect(methods).not.toContain("scheme");
	});

	it("takes a comma-separated override, normalised", () => {
		expect(allowedAdyenPaymentMethods(" PayPal , affirm ,, ")).toEqual(["paypal", "affirm"]);
		expect(allowedAdyenPaymentMethods("  ")).toEqual([...DEFAULT_ADYEN_PAYMENT_METHODS]);
	});
});

describe("resolveAdyenEnvironment", () => {
	it("keeps a test account on test whatever the override says", () => {
		expect(resolveAdyenEnvironment("TEST", "live-us")).toBe("test");
		expect(resolveAdyenEnvironment(undefined, "live-us")).toBe("test");
	});

	it("maps LIVE to live, or to the merchant's region when overridden", () => {
		expect(resolveAdyenEnvironment("LIVE", undefined)).toBe("live");
		expect(resolveAdyenEnvironment("LIVE", "live-us")).toBe("live-us");
		expect(resolveAdyenEnvironment("LIVE", " LIVE-AU ")).toBe("live-au");
		expect(resolveAdyenEnvironment("LIVE", "nonsense")).toBe("live");
		expect(resolveAdyenEnvironment("LIVE", "test")).toBe("live");
	});
});

describe("parseAdyenGatewayConfig", () => {
	const data = {
		clientKey: " test_KEY ",
		environment: "TEST",
		paymentMethodsResponse: {
			paymentMethods: [
				{ type: "scheme", name: "Cards" },
				{ type: "paypal", name: "PayPal" },
				{ type: "Klarna", name: "Klarna" },
				{ type: "ideal", name: "iDEAL" },
				{ name: "no type" },
				null,
			],
			storedPaymentMethods: [{ id: "x", type: "scheme" }],
		},
	};

	it("keeps only the methods this storefront offers and drops stored cards", () => {
		const config = parseAdyenGatewayConfig(data, ["paypal", "klarna"]);
		expect(config).toEqual({
			clientKey: "test_KEY",
			environment: "test",
			paymentMethodsResponse: {
				paymentMethods: [
					{ type: "paypal", name: "PayPal" },
					{ type: "Klarna", name: "Klarna" },
				],
			},
		});
	});

	it("returns an empty list (not null) when Adyen offers none of them", () => {
		const config = parseAdyenGatewayConfig(data, ["affirm"]);
		expect(config?.paymentMethodsResponse.paymentMethods).toEqual([]);
	});

	it("is null when the data can't drive a Drop-in", () => {
		expect(parseAdyenGatewayConfig(null)).toBeNull();
		expect(parseAdyenGatewayConfig("nope")).toBeNull();
		expect(parseAdyenGatewayConfig({ ...data, clientKey: " " })).toBeNull();
		expect(parseAdyenGatewayConfig({ clientKey: "k" })).toBeNull();
	});
});

describe("toMinorUnits", () => {
	it("converts to cents without float drift", () => {
		expect(toMinorUnits(25.5, "USD")).toBe(2550);
		expect(toMinorUnits(19.99, "CAD")).toBe(1999);
		expect(toMinorUnits(0.1 + 0.2, "USD")).toBe(30);
	});

	it("respects currencies with no decimals, and survives an unknown code", () => {
		expect(toMinorUnits(500, "JPY")).toBe(500);
		expect(toMinorUnits(12.34, "NOT-A-CODE")).toBe(1234);
	});
});

describe("toAdyenLocale", () => {
	it("maps storefront languages to Adyen locales", () => {
		expect(toAdyenLocale("en")).toBe("en-US");
		expect(toAdyenLocale("fr")).toBe("fr-FR");
		expect(toAdyenLocale("nb")).toBe("no-NO");
		expect(toAdyenLocale("de-AT")).toBe("de-DE");
	});

	it("falls back to US English", () => {
		expect(toAdyenLocale("xx")).toBe("en-US");
		expect(toAdyenLocale(undefined)).toBe("en-US");
	});
});

describe("Adyen responses", () => {
	it("reads the payment response from transactionInitialize data", () => {
		expect(
			parseAdyenPaymentResponse({
				paymentResponse: { resultCode: "RedirectShopper", action: { type: "redirect", url: "https://x" } },
			}),
		).toEqual({
			resultCode: "RedirectShopper",
			action: { type: "redirect", url: "https://x" },
			refusalReason: undefined,
		});
		expect(parseAdyenPaymentResponse({})).toBeNull();
		expect(parseAdyenPaymentResponse(null)).toBeNull();
		expect(parseAdyenPaymentResponse({ paymentResponse: { pspReference: "1" } })).toBeNull();
	});

	it("reads the details response from transactionProcess data", () => {
		expect(parseAdyenDetailsResponse({ paymentDetailsResponse: { resultCode: "Authorised" } })).toEqual({
			resultCode: "Authorised",
			action: undefined,
			refusalReason: undefined,
		});
		expect(parseAdyenDetailsResponse({ paymentResponse: { resultCode: "Authorised" } })).toBeNull();
	});

	it("classifies the outcome, with any action taking precedence", () => {
		expect(classifyAdyenResponse({ resultCode: "Authorised" })).toBe("authorised");
		expect(classifyAdyenResponse({ resultCode: "IdentifyShopper", action: { type: "threeDS2" } })).toBe(
			"action",
		);
		expect(classifyAdyenResponse({ resultCode: "Pending" })).toBe("pending");
		expect(classifyAdyenResponse({ resultCode: "Received" })).toBe("pending");
		expect(classifyAdyenResponse({ resultCode: "Refused" })).toBe("refused");
		expect(classifyAdyenResponse({ resultCode: "Cancelled" })).toBe("refused");
		expect(classifyAdyenResponse({ resultCode: "Error" })).toBe("refused");
	});
});
