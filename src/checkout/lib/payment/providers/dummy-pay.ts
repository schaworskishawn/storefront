import { getCheckoutTransport } from "@/checkout/lib/checkout-transport";
import { getTransactionInitializeError, type CheckoutGatewayMessages } from "@/checkout/lib/payment-gateways";
import { type PaymentContext, type PaymentResult } from "../types";
import { completeCheckoutOrder } from "../complete-order";
import { checkDummyCardEntry, getDummyCardEntry } from "./dummy-card";

/**
 * Saleor Dummy Payment app — test checkouts only.
 * Simulates a charge via transactionInitialize + checkoutComplete. When the test card form is on screen, the card typed
 * into it decides the outcome: a malformed card never reaches Saleor, the special decline numbers record a failed charge and
 * show the decline reason, and anything else is approved. With no form mounted the charge is simply approved.
 */
export async function executeDummyPayment(
	context: PaymentContext,
	gatewayId: string,
	messages: CheckoutGatewayMessages,
): Promise<PaymentResult> {
	let declineMessage: string | null = null;

	const entry = getDummyCardEntry();
	if (entry) {
		const check = checkDummyCardEntry(entry);
		if (!check.ok) {
			return { ok: false, error: check.message, errorKey: "payment" };
		}
		if (check.outcome.kind === "declined") {
			declineMessage = check.outcome.message;
		}
	}

	const initResult = await getCheckoutTransport().initializeTransaction({
		checkoutId: context.checkoutId,
		amount: context.amount,
		paymentGateway: {
			id: gatewayId,
			data: {
				event: {
					includePspReference: true,
					type: declineMessage ? "CHARGE_FAILURE" : "CHARGE_SUCCESS",
				},
			},
		},
	});

	if (!initResult.ok) {
		console.error("Payment initialization error:", initResult.error);
		return {
			ok: false,
			error: initResult.error || messages.paymentTryAgain,
			errorKey: "payment",
		};
	}

	if (declineMessage) {
		// Saleor now holds a failed transaction, as it would after a real decline; the shopper sees why.
		return { ok: false, error: declineMessage, errorKey: "payment" };
	}

	const transactionError = getTransactionInitializeError(initResult.data, messages);
	if (transactionError) {
		console.error("Transaction initialize failed:", initResult.data);
		return { ok: false, error: transactionError, errorKey: "payment" };
	}

	return completeCheckoutOrder(context.checkoutId);
}
