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
import { executeCryptoPayment } from "./execute-crypto-payment";

const initializeTransaction = vi.fn<CheckoutTransport["initializeTransaction"]>();
const navigate = vi.fn();
const refreshCheckout = vi.fn();

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

const RETURN_URL = "https://shop.example/checkout?checkout=co-1&processingPayment=true";

const run = () =>
	executeCryptoPayment({
		checkout,
		billing: {} as never,
		refreshCheckout,
		returnUrl: RETURN_URL,
		navigate,
		messages,
		gatewayMessages,
	});

const invoiceReply = {
	ok: true,
	data: {
		transaction: { id: "tx-1" },
		transactionEvent: { type: "CHARGE_ACTION_REQUIRED", message: "Waiting for the crypto payment." },
		data: { method: "crypto", invoiceId: "42", invoiceUrl: "https://nowpayments.io/payment/?iid=42" },
	},
} as never;

beforeEach(() => {
	vi.clearAllMocks();
	sessionStorage.clear();
	setCheckoutTransport({
		fetchCheckout: vi.fn(),
		updateBillingAddress: vi.fn(),
		initializePaymentGateways: vi.fn(),
		initializeTransaction,
		processTransaction: vi.fn(),
		completeCheckout: vi.fn(),
		placeETransferOrder: vi.fn(),
	});
	updateCheckoutBilling.mockResolvedValue({ ok: true });
	refreshCheckout.mockResolvedValue(checkout);
	isCheckoutPaymentFlowStale.mockReturnValue(false);
	initializeTransaction.mockResolvedValue(invoiceReply);
});

describe("executeCryptoPayment", () => {
	it("saves billing, confirms the total, asks for an invoice, remembers it, then leaves for the hosted page", async () => {
		expect(await run()).toEqual({ ok: true, invoiceUrl: "https://nowpayments.io/payment/?iid=42" });

		expect(initializeTransaction).toHaveBeenCalledWith({
			checkoutId: "co-1",
			amount: 25,
			paymentGateway: {
				id: "worldwide-vapor.payments",
				data: { method: "crypto", returnUrl: RETURN_URL },
			},
		});
		// Saleor refuses a shopper's call that names a flow strategy (it needs HANDLE_PAYMENTS), so none may be sent.
		expect(initializeTransaction.mock.calls[0][0]).not.toHaveProperty("action");
		expect(readPendingPayment("crypto", "co-1")).toEqual({
			checkoutId: "co-1",
			transactionId: "tx-1",
			invoiceUrl: "https://nowpayments.io/payment/?iid=42",
		});
		expect(navigate).toHaveBeenCalledWith("https://nowpayments.io/payment/?iid=42");
	});

	it("stops at a billing problem without creating an invoice", async () => {
		updateCheckoutBilling.mockResolvedValue({
			ok: false,
			errors: { postalCode: "Invalid" },
			focusField: "postalCode",
		});
		expect(await run()).toMatchObject({ ok: false, kind: "billing", errors: { postalCode: "Invalid" } });
		expect(initializeTransaction).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});

	it("asks the shopper to review when the total moved", async () => {
		refreshCheckout.mockResolvedValue({
			...checkout,
			totalPrice: { gross: { amount: 30, currency: "USD" } },
		});
		expect(await run()).toMatchObject({
			ok: false,
			kind: "price_change",
			notice: { previousAmount: 25, newAmount: 30 },
		});
		expect(initializeTransaction).not.toHaveBeenCalled();
	});

	it("does not start if the shopper navigated away", async () => {
		isCheckoutPaymentFlowStale.mockReturnValue(true);
		expect(await run()).toEqual({ ok: false, kind: "error", message: "interrupted before charge" });
		expect(initializeTransaction).not.toHaveBeenCalled();
	});

	it("surfaces a provider error such as an amount that's too small", async () => {
		initializeTransaction.mockResolvedValue({
			ok: true,
			data: {
				transaction: { id: "tx-1" },
				transactionEvent: { type: "CHARGE_FAILURE", message: "Crypto payment provider: Amount is too small" },
			},
		} as never);
		expect(await run()).toEqual({
			ok: false,
			kind: "error",
			message: "Crypto payment provider: Amount is too small",
		});
		expect(navigate).not.toHaveBeenCalled();
	});

	it("never navigates to a payment page it doesn't trust", async () => {
		initializeTransaction.mockResolvedValue({
			ok: true,
			data: {
				transaction: { id: "tx-1" },
				transactionEvent: { type: "CHARGE_ACTION_REQUIRED" },
				data: { invoiceId: "42", invoiceUrl: "https://evil.example/pay" },
			},
		} as never);
		expect(await run()).toEqual({ ok: false, kind: "error", message: "init failed" });
		expect(navigate).not.toHaveBeenCalled();
		expect(readPendingPayment("crypto", "co-1")).toBeNull();
	});

	it("passes a server error through", async () => {
		initializeTransaction.mockResolvedValue({ ok: false, error: "No response from Saleor" });
		expect(await run()).toEqual({ ok: false, kind: "error", message: "No response from Saleor" });
	});

	it("reports an unexpected error rather than throwing", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		refreshCheckout.mockRejectedValue(new Error("boom"));
		expect(await run()).toEqual({ ok: false, kind: "error", message: "unexpected" });
		spy.mockRestore();
	});

	it("is single-flight: a double click creates one invoice", async () => {
		let release: (value: Awaited<ReturnType<CheckoutTransport["initializeTransaction"]>>) => void = () =>
			undefined;
		initializeTransaction.mockReturnValue(new Promise((resolve) => (release = resolve)));

		const first = run();
		const second = run();
		await new Promise((resolve) => setTimeout(resolve, 0));
		release(invoiceReply);

		await expect(first).resolves.toMatchObject({ ok: true });
		await expect(second).resolves.toMatchObject({ ok: true });
		expect(initializeTransaction).toHaveBeenCalledTimes(1);
		expect(navigate).toHaveBeenCalledTimes(1);
	});
});
