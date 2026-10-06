import { beforeEach, describe, expect, it, vi } from "vitest";
import { setCheckoutTransport, type CheckoutTransport } from "@/checkout/lib/checkout-transport";
import { type CheckoutFragment } from "@/checkout/graphql";

const updateCheckoutBilling = vi.fn();
const finalizeCheckoutOrder = vi.fn();
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
	markPaymentCompleting: vi.fn(),
	clearPaymentCompleting: vi.fn(),
	stashPaymentCompletionError: vi.fn(),
}));

import { executeWvPayPayment } from "./execute-wvpay-payment";

const initializeTransaction = vi.fn<CheckoutTransport["initializeTransaction"]>();

const checkoutOf = (amount: number) =>
	({
		id: "co-1",
		totalPrice: { gross: { amount, currency: "CAD" } },
		channel: { slug: "cad" },
	}) as unknown as CheckoutFragment;

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

const refreshCheckout = vi.fn();
const tokenize = vi.fn();

const run = (checkout: CheckoutFragment, installments: boolean) =>
	executeWvPayPayment({
		checkout,
		billing: {} as never,
		refreshCheckout,
		tokenize,
		messages,
		gatewayMessages,
		installments,
	});

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
	tokenize.mockResolvedValue({ ok: true, opaqueData: { dataDescriptor: "d", dataValue: "tok" } });
	isCheckoutPaymentFlowStale.mockReturnValue(false);
	initializeTransaction.mockResolvedValue({
		ok: true,
		data: { transaction: { id: "tx-1" }, transactionEvent: { type: "CHARGE_SUCCESS", message: "Approved" } },
	} as never);
	finalizeCheckoutOrder.mockResolvedValue({ ok: true, orderId: "order-1" });
});

describe("executeWvPayPayment with Pay in 4", () => {
	it("charges only the deposit, a quarter of the order, and tells the payments app the shopper agreed", async () => {
		const checkout = checkoutOf(120);
		refreshCheckout.mockResolvedValue(checkout);
		expect(await run(checkout, true)).toEqual({ ok: true });

		expect(initializeTransaction).toHaveBeenCalledWith({
			checkoutId: "co-1",
			amount: 30,
			paymentGateway: {
				id: "app.worldwide-vapor.payments",
				data: {
					method: "installments",
					consent: true,
					opaqueData: { dataDescriptor: "d", dataValue: "tok" },
				},
			},
		});
		expect(finalizeCheckoutOrder).toHaveBeenCalledWith("co-1", "cad");
	});

	it("puts odd cents on the deposit", async () => {
		const checkout = checkoutOf(100.03);
		refreshCheckout.mockResolvedValue(checkout);
		await run(checkout, true);
		expect(initializeTransaction.mock.calls[0][0].amount).toBe(25.03);
	});

	it("still charges the whole total, with no installment fields, when Pay in 4 isn't chosen", async () => {
		const checkout = checkoutOf(120);
		refreshCheckout.mockResolvedValue(checkout);
		await run(checkout, false);
		expect(initializeTransaction).toHaveBeenCalledWith({
			checkoutId: "co-1",
			amount: 120,
			paymentGateway: {
				id: "app.worldwide-vapor.payments",
				data: { method: "authorizenet", opaqueData: { dataDescriptor: "d", dataValue: "tok" } },
			},
		});
	});

	it("still checks the whole order's total for changes before charging a deposit", async () => {
		const shown = checkoutOf(120);
		refreshCheckout.mockResolvedValue(checkoutOf(150));
		const result = await run(shown, true);
		expect(result).toMatchObject({ ok: false, kind: "price_change" });
		expect(tokenize).not.toHaveBeenCalled();
		expect(initializeTransaction).not.toHaveBeenCalled();
	});

	it("refuses, before touching the card, a total that can't be split", async () => {
		const checkout = checkoutOf(0.02);
		refreshCheckout.mockResolvedValue(checkout);
		expect(await run(checkout, true)).toMatchObject({
			ok: false,
			kind: "error",
			message: "total unavailable",
		});
		expect(tokenize).not.toHaveBeenCalled();
	});

	it("reports a declined deposit and places no order", async () => {
		const checkout = checkoutOf(120);
		refreshCheckout.mockResolvedValue(checkout);
		initializeTransaction.mockResolvedValue({
			ok: true,
			data: {
				transaction: { id: "tx-1" },
				transactionEvent: { type: "CHARGE_FAILURE", message: "This transaction has been declined." },
			},
		} as never);
		expect(await run(checkout, true)).toMatchObject({ ok: false, kind: "error" });
		expect(finalizeCheckoutOrder).not.toHaveBeenCalled();
	});
});
