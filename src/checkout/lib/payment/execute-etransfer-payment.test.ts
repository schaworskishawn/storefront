import { beforeEach, describe, expect, it, vi } from "vitest";
import { setCheckoutTransport, type CheckoutTransport } from "@/checkout/lib/checkout-transport";

const updateCheckoutBilling = vi.fn();
const navigateToOrderConfirmation = vi.fn();
const markPaymentCompleting = vi.fn();
const clearPaymentCompleting = vi.fn();
const stashPaymentCompletionError = vi.fn();

vi.mock("@/checkout/lib/payment/update-billing", () => ({
	updateCheckoutBilling: (...args: unknown[]) => updateCheckoutBilling(...args),
}));
vi.mock("@/checkout/lib/payment/navigate-to-order", () => ({
	navigateToOrderConfirmation: (...args: unknown[]) => navigateToOrderConfirmation(...args),
}));
vi.mock("@/checkout/lib/payment/checkout-payment-completion", () => ({
	markPaymentCompleting: (...args: unknown[]) => markPaymentCompleting(...args),
	clearPaymentCompleting: (...args: unknown[]) => clearPaymentCompleting(...args),
	stashPaymentCompletionError: (...args: unknown[]) => stashPaymentCompletionError(...args),
}));

import { executeETransferPayment } from "./execute-etransfer-payment";

const placeETransferOrder = vi.fn<CheckoutTransport["placeETransferOrder"]>();

const billing = {
	billingData: { countryCode: "CA", formData: {} },
	sameAsBilling: true,
	hasShippingAddress: true,
	shippingAddress: null,
	userAddresses: undefined,
	authenticated: false,
} as unknown as Parameters<typeof executeETransferPayment>[0]["billing"];

describe("executeETransferPayment", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setCheckoutTransport({
			fetchCheckout: vi.fn(),
			updateBillingAddress: vi.fn(),
			initializePaymentGateways: vi.fn(),
			initializeTransaction: vi.fn(),
			processTransaction: vi.fn(),
			completeCheckout: vi.fn(),
			placeETransferOrder,
		});
		updateCheckoutBilling.mockResolvedValue({ ok: true });
	});

	it("saves billing, places the order unpaid, then goes to the confirmation page", async () => {
		placeETransferOrder.mockResolvedValue({ ok: true, orderId: "order-1" });

		const result = await executeETransferPayment({ checkoutId: "co-1", billing });

		expect(result).toEqual({ ok: true });
		expect(updateCheckoutBilling).toHaveBeenCalledWith(expect.objectContaining({ checkoutId: "co-1" }));
		expect(markPaymentCompleting).toHaveBeenCalledWith("co-1");
		expect(placeETransferOrder).toHaveBeenCalledWith("co-1");
		expect(navigateToOrderConfirmation).toHaveBeenCalledWith("order-1");
	});

	it("stops with billing errors and never places the order", async () => {
		updateCheckoutBilling.mockResolvedValue({
			ok: false,
			errors: { postalCode: "Invalid" },
			focusField: "postalCode",
		});

		const result = await executeETransferPayment({ checkoutId: "co-1", billing });

		expect(result).toEqual({
			ok: false,
			kind: "billing",
			errors: { postalCode: "Invalid" },
			focusField: "postalCode",
		});
		expect(placeETransferOrder).not.toHaveBeenCalled();
		expect(navigateToOrderConfirmation).not.toHaveBeenCalled();
	});

	it("surfaces a server error and clears the completing state so the shopper can retry", async () => {
		placeETransferOrder.mockResolvedValue({ ok: false, error: "Not allowed" });

		const result = await executeETransferPayment({ checkoutId: "co-1", billing });

		expect(result).toEqual({ ok: false, kind: "error", message: "Not allowed" });
		expect(clearPaymentCompleting).toHaveBeenCalled();
		// The payment step is unmounted meanwhile, so the message is stashed for it to show when it returns.
		expect(stashPaymentCompletionError).toHaveBeenCalledWith("Not allowed");
		expect(navigateToOrderConfirmation).not.toHaveBeenCalled();
	});

	it("is single-flight: a double click places one order", async () => {
		let release: (value: Awaited<ReturnType<CheckoutTransport["placeETransferOrder"]>>) => void = () =>
			undefined;
		placeETransferOrder.mockReturnValue(new Promise((resolve) => (release = resolve)));

		const first = executeETransferPayment({ checkoutId: "co-1", billing });
		const second = executeETransferPayment({ checkoutId: "co-1", billing });
		await Promise.resolve();
		release({ ok: true, orderId: "order-1" });

		await expect(first).resolves.toEqual({ ok: true });
		await expect(second).resolves.toEqual({ ok: true });
		expect(placeETransferOrder).toHaveBeenCalledTimes(1);
	});
});
