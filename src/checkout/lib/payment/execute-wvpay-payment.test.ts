import { beforeEach, describe, expect, it, vi } from "vitest";
import { setCheckoutTransport, type CheckoutTransport } from "@/checkout/lib/checkout-transport";
import { type CheckoutFragment } from "@/checkout/graphql";

const updateCheckoutBilling = vi.fn();
const finalizeCheckoutOrder = vi.fn();
const markPaymentCompleting = vi.fn();
const clearPaymentCompleting = vi.fn();
const stashPaymentCompletionError = vi.fn();
const isCheckoutPaymentFlowStale = vi.fn();

vi.mock("@/checkout/lib/payment/update-billing", () => ({
	updateCheckoutBilling: (...args: unknown[]) => updateCheckoutBilling(...args),
}));
vi.mock("@/checkout/lib/payment/finalize-checkout-order", () => ({
	finalizeCheckoutOrder: (...args: unknown[]) => finalizeCheckoutOrder(...args),
}));
vi.mock("@/checkout/lib/payment/checkout-payment-completion", () => ({
	beginCheckoutPaymentFlow: () => 1,
	isCheckoutPaymentFlowStale: (...args: unknown[]) => isCheckoutPaymentFlowStale(...args),
	markPaymentCompleting: (...args: unknown[]) => markPaymentCompleting(...args),
	clearPaymentCompleting: (...args: unknown[]) => clearPaymentCompleting(...args),
	stashPaymentCompletionError: (...args: unknown[]) => stashPaymentCompletionError(...args),
}));

import { executeWvPayPayment } from "./execute-wvpay-payment";

const initializeTransaction = vi.fn<CheckoutTransport["initializeTransaction"]>();

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
	interruptedAfterAuthorize: "paid but not placed",
	unexpectedError: "unexpected",
} as never;

const gatewayMessages = {
	paymentFailed: "payment failed",
	paymentInitFailed: "init failed",
	paymentWebhookFailed: "webhook failed",
} as never;

const billing = {} as never;
const refreshCheckout = vi.fn();
const tokenize = vi.fn();

const run = () =>
	executeWvPayPayment({ checkout, billing, refreshCheckout, tokenize, messages, gatewayMessages });

beforeEach(() => {
	vi.clearAllMocks();
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
	tokenize.mockResolvedValue({ ok: true, opaqueData: { dataDescriptor: "d", dataValue: "tok" } });
	isCheckoutPaymentFlowStale.mockReturnValue(false);
	initializeTransaction.mockResolvedValue({
		ok: true,
		data: { transaction: { id: "tx-1" }, transactionEvent: { type: "CHARGE_SUCCESS", message: "Approved" } },
	} as never);
	finalizeCheckoutOrder.mockResolvedValue({ ok: true, orderId: "order-1" });
});

describe("executeWvPayPayment", () => {
	it("saves billing, confirms the total, tokenizes, charges Saleor's amount, then places the order", async () => {
		expect(await run()).toEqual({ ok: true });

		expect(initializeTransaction).toHaveBeenCalledWith({
			checkoutId: "co-1",
			amount: 25,
			paymentGateway: {
				id: "app.worldwide-vapor.payments",
				data: { method: "authorizenet", opaqueData: { dataDescriptor: "d", dataValue: "tok" } },
			},
		});
		expect(markPaymentCompleting).toHaveBeenCalledWith("co-1");
		expect(finalizeCheckoutOrder).toHaveBeenCalledWith("co-1", "default-channel");
	});

	it("stops at a billing problem before touching the card", async () => {
		updateCheckoutBilling.mockResolvedValue({
			ok: false,
			errors: { postalCode: "Invalid" },
			focusField: "postalCode",
		});
		expect(await run()).toMatchObject({ ok: false, kind: "billing", errors: { postalCode: "Invalid" } });
		expect(tokenize).not.toHaveBeenCalled();
	});

	it("asks the shopper to review when the total moved, before tokenizing", async () => {
		refreshCheckout.mockResolvedValue({
			...checkout,
			totalPrice: { gross: { amount: 30, currency: "USD" } },
		});
		expect(await run()).toMatchObject({
			ok: false,
			kind: "price_change",
			notice: { previousAmount: 25, newAmount: 30 },
		});
		expect(tokenize).not.toHaveBeenCalled();
		expect(initializeTransaction).not.toHaveBeenCalled();
	});

	it("reports a card the processor can't read, pointing at the field, without charging", async () => {
		tokenize.mockResolvedValue({ ok: false, code: "E_WC_15", message: "Please provide a valid CVV." });
		expect(await run()).toEqual({
			ok: false,
			kind: "card",
			field: "cvv",
			message: "Please provide a valid CVV.",
		});
		expect(initializeTransaction).not.toHaveBeenCalled();
	});

	it("surfaces a decline and never places the order", async () => {
		initializeTransaction.mockResolvedValue({
			ok: true,
			data: {
				transaction: { id: "tx-1" },
				transactionEvent: { type: "CHARGE_FAILURE", message: "This transaction has been declined." },
			},
		} as never);
		expect(await run()).toEqual({ ok: false, kind: "error", message: "This transaction has been declined." });
		expect(markPaymentCompleting).not.toHaveBeenCalled();
		expect(finalizeCheckoutOrder).not.toHaveBeenCalled();
	});

	it("passes through a server error from the transaction call", async () => {
		initializeTransaction.mockResolvedValue({ ok: false, error: "No response from Saleor" });
		expect(await run()).toEqual({ ok: false, kind: "error", message: "No response from Saleor" });
	});

	it("never says 'try again' once the card has been charged but the order didn't complete", async () => {
		finalizeCheckoutOrder.mockResolvedValue({ ok: false, error: "Could not complete order" });
		expect(await run()).toEqual({ ok: false, kind: "error", message: "Could not complete order" });
		expect(stashPaymentCompletionError).toHaveBeenCalledWith("Could not complete order");
		expect(clearPaymentCompleting).toHaveBeenCalled();
	});

	it("reports 'paid but not placed' if something throws after the charge", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		finalizeCheckoutOrder.mockRejectedValue(new Error("boom"));
		expect(await run()).toEqual({ ok: false, kind: "error", message: "paid but not placed" });
		expect(stashPaymentCompletionError).toHaveBeenCalledWith("paid but not placed");
		spy.mockRestore();
	});

	it("reports a plain failure if something throws before the charge", async () => {
		const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		tokenize.mockRejectedValue(new Error("boom"));
		expect(await run()).toEqual({ ok: false, kind: "error", message: "unexpected" });
		expect(stashPaymentCompletionError).not.toHaveBeenCalled();
		spy.mockRestore();
	});

	it("does not charge if the shopper navigated away mid-flow", async () => {
		isCheckoutPaymentFlowStale.mockReturnValue(true);
		expect(await run()).toEqual({ ok: false, kind: "error", message: "interrupted before charge" });
		expect(initializeTransaction).not.toHaveBeenCalled();
	});

	it("is single-flight: a double click charges once", async () => {
		let release: (value: Awaited<ReturnType<CheckoutTransport["initializeTransaction"]>>) => void = () =>
			undefined;
		initializeTransaction.mockReturnValue(new Promise((resolve) => (release = resolve)));

		const first = run();
		const second = run();
		await new Promise((resolve) => setTimeout(resolve, 0));
		release({
			ok: true,
			data: { transaction: { id: "tx-1" }, transactionEvent: { type: "CHARGE_SUCCESS" } },
		} as never);

		await expect(first).resolves.toEqual({ ok: true });
		await expect(second).resolves.toEqual({ ok: true });
		expect(initializeTransaction).toHaveBeenCalledTimes(1);
	});
});
