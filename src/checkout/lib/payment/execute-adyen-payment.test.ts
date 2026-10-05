import { beforeEach, describe, expect, it, vi } from "vitest";
import { setCheckoutTransport, type CheckoutTransport } from "@/checkout/lib/checkout-transport";
import { type CheckoutFragment } from "@/checkout/graphql";

const updateCheckoutBilling = vi.fn();
const isCheckoutPaymentFlowStale = vi.fn();

vi.mock("@/checkout/lib/payment/update-billing", () => ({
	updateCheckoutBilling: (...args: unknown[]) => updateCheckoutBilling(...args),
}));
vi.mock("@/checkout/lib/payment/checkout-payment-completion", () => ({
	beginCheckoutPaymentFlow: () => 1,
	isCheckoutPaymentFlowStale: (...args: unknown[]) => isCheckoutPaymentFlowStale(...args),
}));

import { readPendingPayment } from "./pending-payment-storage";
import { pickAdyenPaymentData, submitAdyenDetails, submitAdyenPayment } from "./execute-adyen-payment";

const initializeTransaction = vi.fn<CheckoutTransport["initializeTransaction"]>();
const processTransaction = vi.fn<CheckoutTransport["processTransaction"]>();

const checkout = {
	id: "co-1",
	totalPrice: { gross: { amount: 25, currency: "USD" } },
	channel: { slug: "default-channel" },
} as unknown as CheckoutFragment;

const messages = {
	totalsRefreshFailed: "refresh failed",
	totalUnavailable: "total unavailable",
	currencyUnavailable: "currency unavailable",
	interruptedBeforeCharge: "interrupted before charge",
	unexpectedError: "unexpected",
} as never;

const gatewayMessages = {
	paymentFailed: "payment failed",
	paymentInitFailed: "init failed",
	paymentWebhookFailed: "webhook failed",
} as never;

const refreshCheckout = vi.fn();

const stateData = {
	paymentMethod: { type: "paypal", subtype: "redirect" },
	browserInfo: { userAgent: "UA", language: "en-US" },
	riskData: { clientData: "ignore-me" },
	clientStateDataIndicator: true,
};

const submit = () =>
	submitAdyenPayment({
		checkout,
		billing: {} as never,
		refreshCheckout,
		stateData,
		returnUrl: "https://shop.example/checkout?checkout=co-1&adyen=return",
		origin: "https://shop.example",
		messages,
		gatewayMessages,
	});

beforeEach(() => {
	vi.clearAllMocks();
	sessionStorage.clear();
	setCheckoutTransport({
		fetchCheckout: vi.fn(),
		updateBillingAddress: vi.fn(),
		initializePaymentGateways: vi.fn(),
		initializeTransaction,
		processTransaction,
		completeCheckout: vi.fn(),
		placeETransferOrder: vi.fn(),
	});
	updateCheckoutBilling.mockResolvedValue({ ok: true });
	refreshCheckout.mockResolvedValue(checkout);
	isCheckoutPaymentFlowStale.mockReturnValue(false);
	initializeTransaction.mockResolvedValue({
		ok: true,
		data: {
			transaction: { id: "tx-1" },
			transactionEvent: { type: "AUTHORIZATION_SUCCESS", message: "ok" },
			data: { paymentResponse: { resultCode: "Authorised", pspReference: "PSP1" } },
		},
	} as never);
});

describe("pickAdyenPaymentData", () => {
	it("keeps only what the Saleor Adyen app accepts", () => {
		expect(pickAdyenPaymentData(stateData)).toEqual({
			paymentMethod: { type: "paypal", subtype: "redirect" },
			browserInfo: { userAgent: "UA", language: "en-US" },
		});
		expect(pickAdyenPaymentData({})).toEqual({});
	});
});

describe("submitAdyenPayment", () => {
	it("saves billing, confirms the total, then initializes the transaction with Saleor's amount", async () => {
		const result = await submit();

		expect(result).toEqual({
			ok: true,
			transactionId: "tx-1",
			response: { resultCode: "Authorised", action: undefined, refusalReason: undefined },
		});
		expect(initializeTransaction).toHaveBeenCalledWith({
			checkoutId: "co-1",
			amount: 25,
			paymentGateway: {
				id: "app.saleor.adyen",
				data: {
					paymentMethod: { type: "paypal", subtype: "redirect" },
					browserInfo: { userAgent: "UA", language: "en-US" },
					returnUrl: "https://shop.example/checkout?checkout=co-1&adyen=return",
					origin: "https://shop.example",
					channel: "Web",
				},
			},
		});
	});

	it("remembers the transaction and redirect paymentData so a return from a lender can finish", async () => {
		initializeTransaction.mockResolvedValue({
			ok: true,
			data: {
				transaction: { id: "tx-9" },
				transactionEvent: { type: "AUTHORIZATION_ACTION_REQUIRED" },
				data: {
					paymentResponse: {
						resultCode: "RedirectShopper",
						action: { type: "redirect", url: "https://klarna.example/pay", paymentData: "pd-123" },
					},
				},
			},
		} as never);

		const result = await submit();

		expect(result).toMatchObject({
			ok: true,
			transactionId: "tx-9",
			response: { resultCode: "RedirectShopper" },
		});
		expect(readPendingPayment("adyen", "co-1")).toEqual({
			checkoutId: "co-1",
			transactionId: "tx-9",
			paymentData: "pd-123",
		});
	});

	it("stops at a billing problem before creating a transaction", async () => {
		updateCheckoutBilling.mockResolvedValue({
			ok: false,
			errors: { postalCode: "Invalid" },
			focusField: "postalCode",
		});
		expect(await submit()).toMatchObject({ ok: false, kind: "billing", errors: { postalCode: "Invalid" } });
		expect(initializeTransaction).not.toHaveBeenCalled();
	});

	it("asks the shopper to review when the total moved after the Drop-in was set up", async () => {
		refreshCheckout.mockResolvedValue({
			...checkout,
			totalPrice: { gross: { amount: 30, currency: "USD" } },
		});
		expect(await submit()).toMatchObject({
			ok: false,
			kind: "price_change",
			notice: { previousAmount: 25, newAmount: 30 },
		});
		expect(initializeTransaction).not.toHaveBeenCalled();
	});

	it("does not start a payment if the shopper navigated away", async () => {
		isCheckoutPaymentFlowStale.mockReturnValue(true);
		expect(await submit()).toEqual({ ok: false, kind: "error", message: "interrupted before charge" });
		expect(initializeTransaction).not.toHaveBeenCalled();
	});

	it("surfaces a refusal with the lender's or PayPal's message", async () => {
		initializeTransaction.mockResolvedValue({
			ok: true,
			data: {
				transaction: { id: "tx-1" },
				transactionEvent: { type: "AUTHORIZATION_FAILURE", message: "Refused" },
			},
		} as never);
		expect(await submit()).toEqual({ ok: false, kind: "error", message: "Refused" });
		expect(readPendingPayment("adyen", "co-1")).toBeNull();
	});

	it("passes a server error through, and reports a reply without a payment response", async () => {
		initializeTransaction.mockResolvedValueOnce({ ok: false, error: "No response from Saleor" });
		expect(await submit()).toEqual({ ok: false, kind: "error", message: "No response from Saleor" });

		initializeTransaction.mockResolvedValueOnce({
			ok: true,
			data: { transaction: { id: "tx-1" }, transactionEvent: { type: "AUTHORIZATION_SUCCESS" }, data: {} },
		} as never);
		expect(await submit()).toEqual({ ok: false, kind: "error", message: "init failed" });
	});

	it("reports an unexpected error rather than throwing", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		refreshCheckout.mockRejectedValue(new Error("boom"));
		expect(await submit()).toEqual({ ok: false, kind: "error", message: "unexpected" });
		spy.mockRestore();
	});

	it("is single-flight: a double click creates one transaction", async () => {
		let release: (value: Awaited<ReturnType<CheckoutTransport["initializeTransaction"]>>) => void = () =>
			undefined;
		initializeTransaction.mockReturnValue(new Promise((resolve) => (release = resolve)));

		const first = submit();
		const second = submit();
		await new Promise((resolve) => setTimeout(resolve, 0));
		release({
			ok: true,
			data: {
				transaction: { id: "tx-1" },
				transactionEvent: { type: "AUTHORIZATION_SUCCESS" },
				data: { paymentResponse: { resultCode: "Authorised" } },
			},
		} as never);

		await expect(first).resolves.toMatchObject({ ok: true });
		await expect(second).resolves.toMatchObject({ ok: true });
		expect(initializeTransaction).toHaveBeenCalledTimes(1);
	});
});

describe("submitAdyenDetails", () => {
	const details = { details: { redirectResult: "abc" }, paymentData: "pd" };
	const run = () => submitAdyenDetails({ transactionId: "tx-1", data: details, messages, gatewayMessages });

	it("sends the Drop-in details to Saleor and reads Adyen's verdict", async () => {
		processTransaction.mockResolvedValue({
			ok: true,
			data: {
				transaction: { id: "tx-1" },
				transactionEvent: { type: "AUTHORIZATION_SUCCESS" },
				data: { paymentDetailsResponse: { resultCode: "Authorised" } },
			},
		} as never);

		expect(await run()).toEqual({
			ok: true,
			response: { resultCode: "Authorised", action: undefined, refusalReason: undefined },
		});
		expect(processTransaction).toHaveBeenCalledWith({ id: "tx-1", data: details });
	});

	it("can hand back another action (e.g. a 3-D Secure challenge after the fingerprint)", async () => {
		processTransaction.mockResolvedValue({
			ok: true,
			data: {
				transaction: { id: "tx-1" },
				transactionEvent: { type: "AUTHORIZATION_ACTION_REQUIRED" },
				data: { paymentDetailsResponse: { resultCode: "ChallengeShopper", action: { type: "threeDS2" } } },
			},
		} as never);
		expect(await run()).toMatchObject({ ok: true, response: { action: { type: "threeDS2" } } });
	});

	it("reports a refusal, a server error, or a reply Adyen didn't fill in", async () => {
		processTransaction.mockResolvedValueOnce({
			ok: true,
			data: {
				transaction: { id: "tx-1" },
				transactionEvent: { type: "AUTHORIZATION_FAILURE", message: "Refused" },
			},
		} as never);
		expect(await run()).toEqual({ ok: false, message: "Refused" });

		processTransaction.mockResolvedValueOnce({ ok: false, error: "No response from Saleor" });
		expect(await run()).toEqual({ ok: false, message: "No response from Saleor" });

		processTransaction.mockResolvedValueOnce({
			ok: true,
			data: { transaction: { id: "tx-1" }, transactionEvent: { type: "AUTHORIZATION_SUCCESS" }, data: {} },
		} as never);
		expect(await run()).toEqual({ ok: false, message: "payment failed" });
	});

	it("reports an unexpected error rather than throwing", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		processTransaction.mockRejectedValue(new Error("boom"));
		expect(await run()).toEqual({ ok: false, message: "unexpected" });
		spy.mockRestore();
	});
});
