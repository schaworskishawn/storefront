import { afterEach, describe, expect, it, vi } from "vitest";
import {
	CRYPTO_NOT_ENABLED_MESSAGE,
	getCryptoPaymentGuardError,
	isCryptoPaymentEnabled,
	isTrustedCryptoInvoiceUrl,
	parseCryptoInvoice,
} from "./crypto";
import { WVPAY_GATEWAY_ID, wvPayOffersCrypto } from "./wvpay";

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("crypto enablement", () => {
	it("is off unless a flag is set — there is no development default", () => {
		vi.stubEnv("NODE_ENV", "development");
		expect(isCryptoPaymentEnabled()).toBe(false);
		vi.stubEnv("NEXT_PUBLIC_ENABLE_CRYPTO_PAYMENTS", "true");
		expect(isCryptoPaymentEnabled()).toBe(true);
	});

	it("also honours the server-only flag", () => {
		vi.stubEnv("ENABLE_CRYPTO_PAYMENTS", "true");
		expect(isCryptoPaymentEnabled()).toBe(true);
	});
});

describe("guards for the payments app", () => {
	const crypto = { method: "crypto", returnUrl: "https://shop.example/checkout" };
	const other = { method: "something-else" };

	it("blocks crypto requests only when the crypto flag is off", () => {
		expect(getCryptoPaymentGuardError(WVPAY_GATEWAY_ID, crypto)).toBe(CRYPTO_NOT_ENABLED_MESSAGE);
		vi.stubEnv("NEXT_PUBLIC_ENABLE_CRYPTO_PAYMENTS", "true");
		expect(getCryptoPaymentGuardError(WVPAY_GATEWAY_ID, crypto)).toBeNull();
	});

	it("leaves other methods and other gateways alone", () => {
		expect(getCryptoPaymentGuardError(WVPAY_GATEWAY_ID, other)).toBeNull();
		expect(getCryptoPaymentGuardError("saleor.app.payment.stripe", crypto)).toBeNull();
		expect(getCryptoPaymentGuardError(null, crypto)).toBeNull();
	});

	it("reads whether the app offers crypto from its gateway config", () => {
		expect(wvPayOffersCrypto({ methods: ["crypto"] })).toBe(true);
		expect(wvPayOffersCrypto({ methods: [] })).toBe(false);
		expect(wvPayOffersCrypto(null)).toBe(false);
	});
});

describe("isTrustedCryptoInvoiceUrl", () => {
	it("accepts the provider's own https pages", () => {
		expect(isTrustedCryptoInvoiceUrl("https://nowpayments.io/payment/?iid=1")).toBe(true);
		expect(isTrustedCryptoInvoiceUrl("https://sandbox.nowpayments.io/payment/?iid=1")).toBe(true);
	});

	it("rejects everything else, including look-alike hosts", () => {
		expect(isTrustedCryptoInvoiceUrl("http://nowpayments.io/payment/")).toBe(false);
		expect(isTrustedCryptoInvoiceUrl("https://evil.example/payment/")).toBe(false);
		expect(isTrustedCryptoInvoiceUrl("https://nowpayments.io.evil.example/")).toBe(false);
		expect(isTrustedCryptoInvoiceUrl("https://notnowpayments.io/")).toBe(false);
		expect(isTrustedCryptoInvoiceUrl("javascript:alert(1)")).toBe(false);
		expect(isTrustedCryptoInvoiceUrl("")).toBe(false);
	});
});

describe("parseCryptoInvoice", () => {
	it("reads the invoice from transactionInitialize data", () => {
		expect(
			parseCryptoInvoice({
				method: "crypto",
				invoiceId: "42",
				invoiceUrl: "https://nowpayments.io/payment/?iid=42",
			}),
		).toEqual({ invoiceId: "42", invoiceUrl: "https://nowpayments.io/payment/?iid=42" });
	});

	it("is null for missing data or an untrusted URL", () => {
		expect(parseCryptoInvoice(null)).toBeNull();
		expect(parseCryptoInvoice({})).toBeNull();
		expect(parseCryptoInvoice({ invoiceId: "1", invoiceUrl: "https://evil.example/pay" })).toBeNull();
	});
});
