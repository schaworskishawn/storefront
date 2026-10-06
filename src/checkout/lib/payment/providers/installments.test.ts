import { afterEach, describe, expect, it, vi } from "vitest";
import {
	INSTALLMENTS_NOT_ENABLED_MESSAGE,
	expectedInitializeAmount,
	getInstallmentsGuardError,
	hasInstallmentDeposit,
	isInstallmentsEnabled,
	isInstallmentsOffered,
	isWvPayInstallmentsRequest,
} from "./installments";
import { WVPAY_GATEWAY_ID } from "./wvpay";

const WVPAY = { id: WVPAY_GATEWAY_ID, name: "Worldwide Vapor Payments" };
const STRIPE = { id: "saleor.app.payment.stripe", name: "Stripe" };

const checkout = (total = 120, currency = "CAD", channel = "cad") => ({
	totalPrice: { gross: { amount: total, currency } },
	channel: { slug: channel },
});

const turnOn = () => {
	vi.stubEnv("NEXT_PUBLIC_ENABLE_AUTHORIZENET_PAYMENTS", "true");
	vi.stubEnv("NEXT_PUBLIC_ENABLE_INSTALLMENTS", "true");
	vi.stubEnv("NEXT_PUBLIC_INSTALLMENT_CHANNELS", "cad");
};

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("isInstallmentsEnabled", () => {
	it("is off by default", () => {
		expect(isInstallmentsEnabled()).toBe(false);
	});

	it("needs both its own flag and the card flag, because the deposit is a card payment", () => {
		vi.stubEnv("NEXT_PUBLIC_ENABLE_INSTALLMENTS", "true");
		expect(isInstallmentsEnabled()).toBe(false);
		vi.stubEnv("NEXT_PUBLIC_ENABLE_AUTHORIZENET_PAYMENTS", "true");
		expect(isInstallmentsEnabled()).toBe(true);
	});
});

describe("isInstallmentsOffered", () => {
	it("is offered for an eligible order when the payments app is on the checkout", () => {
		turnOn();
		expect(isInstallmentsOffered(checkout(), [WVPAY])).toBe(true);
	});

	it("is not offered without the payments app's gateway", () => {
		turnOn();
		expect(isInstallmentsOffered(checkout(), [STRIPE])).toBe(false);
		expect(isInstallmentsOffered(checkout(), null)).toBe(false);
	});

	it("is not offered in a channel that isn't listed, below or above the limits, or with no total", () => {
		turnOn();
		expect(isInstallmentsOffered(checkout(120, "USD", "default-channel"), [WVPAY])).toBe(false);
		expect(isInstallmentsOffered(checkout(20), [WVPAY])).toBe(false);
		expect(isInstallmentsOffered(checkout(5000), [WVPAY])).toBe(false);
		expect(isInstallmentsOffered({ totalPrice: null, channel: { slug: "cad" } }, [WVPAY])).toBe(false);
	});

	it("is not offered when the flags are off", () => {
		expect(isInstallmentsOffered(checkout(), [WVPAY])).toBe(false);
	});
});

describe("hasInstallmentDeposit", () => {
	it("recognises a part-paid checkout, but only while Pay in 4 is on", () => {
		expect(hasInstallmentDeposit({ chargeStatus: "PARTIAL" })).toBe(false);
		turnOn();
		expect(hasInstallmentDeposit({ chargeStatus: "PARTIAL" })).toBe(true);
		for (const status of ["NONE", "FULL", "OVERCHARGED", null, undefined]) {
			expect(hasInstallmentDeposit({ chargeStatus: status })).toBe(false);
		}
	});
});

describe("getInstallmentsGuardError", () => {
	const data = { method: "installments" };

	it("blocks a Pay in 4 request while it's switched off", () => {
		expect(getInstallmentsGuardError(WVPAY_GATEWAY_ID, data)).toBe(INSTALLMENTS_NOT_ENABLED_MESSAGE);
		turnOn();
		expect(getInstallmentsGuardError(WVPAY_GATEWAY_ID, data)).toBeNull();
	});

	it("leaves ordinary card, crypto and other gateways' requests alone", () => {
		expect(getInstallmentsGuardError(WVPAY_GATEWAY_ID, { method: "authorizenet" })).toBeNull();
		expect(getInstallmentsGuardError(WVPAY_GATEWAY_ID, { method: "crypto" })).toBeNull();
		expect(getInstallmentsGuardError(STRIPE.id, data)).toBeNull();
		expect(getInstallmentsGuardError(null, data)).toBeNull();
		expect(getInstallmentsGuardError(WVPAY_GATEWAY_ID, null)).toBeNull();
	});
});

describe("isWvPayInstallmentsRequest", () => {
	it("is true only for method: installments", () => {
		expect(isWvPayInstallmentsRequest({ method: "installments" })).toBe(true);
		for (const value of [
			{ method: "authorizenet" },
			{ method: "Installments" },
			{},
			null,
			undefined,
			"installments",
		]) {
			expect(isWvPayInstallmentsRequest(value)).toBe(false);
		}
	});
});

describe("expectedInitializeAmount", () => {
	it("is the whole total for an ordinary payment", () => {
		expect(expectedInitializeAmount(120, { method: "authorizenet" })).toBe(120);
		expect(expectedInitializeAmount(120, undefined)).toBe(120);
	});

	it("is just the deposit, a quarter, for Pay in 4", () => {
		expect(expectedInitializeAmount(120, { method: "installments" })).toBe(30);
		// Odd cents sit on the deposit: 100.03 is three payments of 25.00 and a deposit of 25.03.
		expect(expectedInitializeAmount(100.03, { method: "installments" })).toBe(25.03);
	});

	it("is nothing when there is no total, or the total can't be split", () => {
		expect(expectedInitializeAmount(null, { method: "installments" })).toBeNull();
		expect(expectedInitializeAmount(null, undefined)).toBeNull();
		expect(expectedInitializeAmount(0, { method: "installments" })).toBeNull();
	});
});
