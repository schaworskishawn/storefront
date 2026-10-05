import { getCheckoutTransport } from "@/checkout/lib/checkout-transport";
import {
	clearPaymentCompleting,
	markPaymentCompleting,
	stashPaymentCompletionError,
} from "@/checkout/lib/payment/checkout-payment-completion";
import { navigateToOrderConfirmation } from "@/checkout/lib/payment/navigate-to-order";
import { updateCheckoutBilling } from "@/checkout/lib/payment/update-billing";
import { type StripeBillingContext } from "@/checkout/components/payment/stripe/stripe-billing-context";

export type ETransferPayResult =
	| { ok: true }
	| { ok: false; kind: "error"; message: string }
	| { ok: false; kind: "billing"; errors: Record<string, string>; focusField?: string };

let inFlight: Promise<ETransferPayResult> | null = null;

/**
 * Interac e-Transfer "pay": save billing, place the order unpaid (the server action also emails the transfer
 * instructions), then go to the confirmation page, which shows the same instructions.
 *
 * Single-flight like the Stripe path — a double click must not place two orders.
 */
export async function executeETransferPayment(params: {
	checkoutId: string;
	billing: StripeBillingContext;
}): Promise<ETransferPayResult> {
	if (inFlight) {
		return inFlight;
	}

	const run = runETransferPayment(params);
	inFlight = run;

	try {
		return await run;
	} finally {
		if (inFlight === run) {
			inFlight = null;
		}
	}
}

async function runETransferPayment({
	checkoutId,
	billing,
}: {
	checkoutId: string;
	billing: StripeBillingContext;
}): Promise<ETransferPayResult> {
	const billingResult = await updateCheckoutBilling({ checkoutId, ...billing });
	if (!billingResult.ok) {
		return { ok: false, kind: "billing", errors: billingResult.errors, focusField: billingResult.focusField };
	}

	markPaymentCompleting(checkoutId);

	const result = await getCheckoutTransport().placeETransferOrder(checkoutId);
	if (!result.ok) {
		// markPaymentCompleting swapped the whole checkout for the "processing" screen, which unmounted the payment step
		// (and the component that would show this error). Stash the message so the step shows it when it comes back.
		stashPaymentCompletionError(result.error);
		clearPaymentCompleting();
		return { ok: false, kind: "error", message: result.error };
	}

	// Client navigation, same reasoning as finalizeCheckoutOrder — see navigate-to-order.ts.
	navigateToOrderConfirmation(result.orderId);
	return { ok: true };
}
