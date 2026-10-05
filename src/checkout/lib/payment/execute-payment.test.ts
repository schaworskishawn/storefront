import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

import { setCheckoutTransport, type CheckoutTransport } from "@/checkout/lib/checkout-transport";
import { buildCheckoutGatewayMessages } from "@/checkout/lib/payment/gateway-messages";
import {
	DECLINE_MESSAGES,
	DEFAULT_DUMMY_CARD,
	DUMMY_CARD_INVALID_MESSAGE,
	setDummyCardEntry,
} from "./providers/dummy-card";
import { executePayment } from "./execute-payment";

const gatewayMessages = buildCheckoutGatewayMessages((key, values) => {
	const templates: Record<string, string> = {
		unsupportedList: `Unsupported: ${values?.gateways ?? ""}`,
		unsupportedEmpty: "No gateway",
		dummyMissingBody: "Dummy missing",
		noneTitle: "None",
		noneBody: "None body",
		unsupportedTitle: "Unsupported",
		dummyMissingTitle: "Dummy missing title",
		noGatewayConfigured: "No gateway configured",
		stripeUseCardForm: "Use card form",
		paymentFailed: "Payment failed",
		paymentTryAgain: "Try again",
		paymentWebhookFailed: "Webhook failed",
		paymentInitFailed: "Init failed",
	};
	return templates[key] ?? key;
});

const initializeTransaction = vi.fn<CheckoutTransport["initializeTransaction"]>();
const completeCheckout = vi.fn<CheckoutTransport["completeCheckout"]>();

const fakeTransport: CheckoutTransport = {
	fetchCheckout: vi.fn(),
	updateBillingAddress: vi.fn(),
	initializePaymentGateways: vi.fn(),
	initializeTransaction,
	processTransaction: vi.fn(),
	completeCheckout,
	placeETransferOrder: vi.fn(),
};

describe("executePayment", () => {
	beforeEach(() => {
		initializeTransaction.mockReset();
		completeCheckout.mockReset();
		setCheckoutTransport(fakeTransport);
	});

	it("runs dummy payment flow and completes checkout", async () => {
		initializeTransaction.mockResolvedValue({
			ok: true,
			data: {
				transactionEvent: { type: "CHARGE_SUCCESS", message: "ok" },
				transaction: { id: "tx-1" },
				errors: [],
			},
		});
		completeCheckout.mockResolvedValue({ ok: true, orderId: "order-1" });

		const result = await executePayment(
			{ type: "dummy", gateway: { id: "saleor.io.dummy-payment-app", name: "Dummy" }, submitMode: "server" },
			{ checkoutId: "checkout-1", amount: 42.5 },
			gatewayMessages,
		);

		expect(result).toEqual({ ok: true, orderId: "order-1" });
		expect(initializeTransaction).toHaveBeenCalledWith({
			checkoutId: "checkout-1",
			amount: 42.5,
			paymentGateway: {
				id: "saleor.io.dummy-payment-app",
				data: { event: { includePspReference: true, type: "CHARGE_SUCCESS" } },
			},
		});
	});

	it("surfaces initializeTransaction error message", async () => {
		initializeTransaction.mockResolvedValue({
			ok: false,
			error: "Test payment is not available in this environment.",
		});

		const result = await executePayment(
			{ type: "dummy", gateway: { id: "saleor.io.dummy-payment-app", name: "Dummy" }, submitMode: "server" },
			{ checkoutId: "checkout-1", amount: 10 },
			gatewayMessages,
		);

		expect(result).toEqual({
			ok: false,
			error: "Test payment is not available in this environment.",
			errorKey: "payment",
		});
	});

	describe("dummy payment with the test card form", () => {
		const dummyProvider = {
			type: "dummy",
			gateway: { id: "saleor.io.dummy-payment-app", name: "Dummy" },
			submitMode: "server",
		} as const;
		const context = { checkoutId: "checkout-1", amount: 42.5 };

		afterEach(() => {
			setDummyCardEntry(null);
		});

		it("charges when the form holds the approved test card", async () => {
			setDummyCardEntry(DEFAULT_DUMMY_CARD);
			initializeTransaction.mockResolvedValue({
				ok: true,
				data: { transactionEvent: { type: "CHARGE_SUCCESS" }, transaction: { id: "tx-1" } },
			});
			completeCheckout.mockResolvedValue({ ok: true, orderId: "order-1" });

			expect(await executePayment(dummyProvider, context, gatewayMessages)).toEqual({
				ok: true,
				orderId: "order-1",
			});
			expect(initializeTransaction).toHaveBeenCalledWith(
				expect.objectContaining({
					paymentGateway: expect.objectContaining({
						data: { event: { includePspReference: true, type: "CHARGE_SUCCESS" } },
					}),
				}),
			);
		});

		it("records a failed charge for a decline card, shows the reason, and never places the order", async () => {
			setDummyCardEntry({ ...DEFAULT_DUMMY_CARD, number: "4000 0000 0000 0002" });
			initializeTransaction.mockResolvedValue({
				ok: true,
				data: { transactionEvent: { type: "CHARGE_FAILURE" }, transaction: { id: "tx-1" } },
			});

			expect(await executePayment(dummyProvider, context, gatewayMessages)).toEqual({
				ok: false,
				error: DECLINE_MESSAGES.declined,
				errorKey: "payment",
			});
			expect(initializeTransaction).toHaveBeenCalledWith(
				expect.objectContaining({
					paymentGateway: expect.objectContaining({
						data: { event: { includePspReference: true, type: "CHARGE_FAILURE" } },
					}),
				}),
			);
			expect(completeCheckout).not.toHaveBeenCalled();
		});

		it("does not call Saleor for a malformed card", async () => {
			setDummyCardEntry({ ...DEFAULT_DUMMY_CARD, number: "1234" });

			expect(await executePayment(dummyProvider, context, gatewayMessages)).toEqual({
				ok: false,
				error: DUMMY_CARD_INVALID_MESSAGE,
				errorKey: "payment",
			});
			expect(initializeTransaction).not.toHaveBeenCalled();
		});

		it("still reports a Saleor error when declining a card", async () => {
			setDummyCardEntry({ ...DEFAULT_DUMMY_CARD, number: "4000 0000 0000 0002" });
			initializeTransaction.mockResolvedValue({ ok: false, error: "No response from Saleor" });

			expect(await executePayment(dummyProvider, context, gatewayMessages)).toEqual({
				ok: false,
				error: "No response from Saleor",
				errorKey: "payment",
			});
		});
	});

	it("completes checkout without payment when amount is zero", async () => {
		completeCheckout.mockResolvedValue({ ok: true, orderId: "order-free" });

		const result = await executePayment(
			{ type: "stripe", gateway: { id: "stripe", name: "Stripe" }, submitMode: "client" },
			{ checkoutId: "checkout-1", amount: 0 },
			gatewayMessages,
		);

		expect(result).toEqual({ ok: true, orderId: "order-free" });
		expect(initializeTransaction).not.toHaveBeenCalled();
		expect(completeCheckout).toHaveBeenCalledWith("checkout-1");
	});

	it("returns error for unsupported provider", async () => {
		const result = await executePayment(
			{ type: "unsupported", gateways: [{ id: "stripe", name: "Stripe" }] },
			{ checkoutId: "checkout-1", amount: 10 },
			gatewayMessages,
		);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error).toContain("Stripe");
		}
	});
});
