import { updateCheckoutQuery } from "@/checkout/lib/checkout-search-params";
import {
	clearPaymentCompleting,
	stashPaymentCompletionError,
} from "@/checkout/lib/payment/checkout-payment-completion";
import {
	clearPendingPayment,
	type PendingPaymentProvider,
} from "@/checkout/lib/payment/pending-payment-storage";

/** Drops the return markers from the URL and takes the checkout off its processing screen, back to the payment step. */
export function leavePaymentReturn(): void {
	updateCheckoutQuery({
		processingPayment: null,
		redirectResult: null,
		transaction: null,
		step: "payment",
	});
	clearPaymentCompleting();
}

/**
 * A payment that left the page came back unfinished: show why on the payment step and forget the attempt, so the shopper
 * starts a fresh one. (A payment that is merely still confirming is NOT a failure — use `leavePaymentReturn` and keep it.)
 */
export function reportExternalReturnFailure(
	provider: PendingPaymentProvider,
	message: string,
	onError: (message: string) => void,
): void {
	stashPaymentCompletionError(message);
	clearPendingPayment(provider);
	leavePaymentReturn();
	onError(message);
}
