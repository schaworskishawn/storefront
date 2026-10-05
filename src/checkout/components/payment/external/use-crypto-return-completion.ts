"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useCheckoutPaymentMessages } from "@/checkout/hooks/use-checkout-payment-messages";
import { getCheckoutTransport } from "@/checkout/lib/checkout-transport";
import {
	clearPaymentCompleting,
	markPaymentCompleting,
	stashPaymentCompletionError,
} from "@/checkout/lib/payment/checkout-payment-completion";
import { finalizeCheckoutOrder } from "@/checkout/lib/payment/finalize-checkout-order";
import { clearPendingPayment, readPendingPayment } from "@/checkout/lib/payment/pending-payment-storage";
import { waitForCheckoutPayment } from "@/checkout/lib/payment/wait-for-checkout-payment";
import { rethrowNextInternalError } from "@/checkout/lib/rethrow-next-internal-error";
import { getQueryParams } from "@/checkout/lib/utils/url";
import { leavePaymentReturn, reportExternalReturnFailure } from "./report-return-failure";

type Params = {
	checkoutId: string;
	onError: (message: string) => void;
	/** Shown when the checkout is gone after paying (Saleor already turned it into an order). */
	orderPlacedMessage: string;
};

/**
 * The shopper has come back from the crypto provider's page. Saleor learns the payment landed from the provider's IPN call
 * (see src/app/api/saleor-app/crypto/ipn), which can lag the redirect, so watch the checkout for a short while and place the
 * order the moment it is covered. If it isn't confirmed in time the shopper is taken back to the payment step, where the
 * pending panel explains and the usual "complete order" recovery appears once the payment lands.
 */
export function useCryptoReturnCompletion({ checkoutId, onError, orderPlacedMessage }: Params) {
	const searchParams = useSearchParams()!;
	const paymentMessages = useCheckoutPaymentMessages();
	const startedRef = useRef(false);

	useEffect(() => {
		const { processingPayment, redirectResult, paymentIntent } = getQueryParams(searchParams);
		// Adyen and Stripe have their own return markers; ours is the bare `processingPayment` with a pending crypto attempt.
		if (!processingPayment || redirectResult || paymentIntent) {
			return;
		}
		if (startedRef.current) {
			return;
		}

		const pending = readPendingPayment("crypto", checkoutId);
		if (!pending) {
			return;
		}

		startedRef.current = true;
		markPaymentCompleting(checkoutId);

		const complete = async () => {
			try {
				const waited = await waitForCheckoutPayment({
					checkoutId,
					fetchCheckout: getCheckoutTransport().fetchCheckout,
				});

				if (waited.status === "ready") {
					clearPendingPayment("crypto");
					const completed = await finalizeCheckoutOrder(checkoutId, waited.checkout.channel.slug);
					if (!completed.ok) {
						reportExternalReturnFailure("crypto", completed.error, onError);
					}
					// On success the page navigates to the order confirmation.
					return;
				}

				if (waited.status === "gone") {
					stashPaymentCompletionError(orderPlacedMessage);
					clearPendingPayment("crypto");
					leavePaymentReturn();
					onError(orderPlacedMessage);
					return;
				}

				if (waited.status === "unavailable") {
					// Keep the attempt: we couldn't see Saleor, which says nothing about whether the payment landed.
					stashPaymentCompletionError(paymentMessages.verificationUnavailable);
					leavePaymentReturn();
					onError(paymentMessages.verificationUnavailable);
					return;
				}

				// Still confirming. Not an error — the payment step shows the pending panel (the attempt stays on record).
				leavePaymentReturn();
			} catch (error) {
				rethrowNextInternalError(error);
				console.error("Crypto return completion failed:", error);
				clearPaymentCompleting();
				stashPaymentCompletionError(paymentMessages.unexpectedError);
				leavePaymentReturn();
				onError(paymentMessages.unexpectedError);
			}
		};

		void complete();
	}, [searchParams, checkoutId, onError, orderPlacedMessage, paymentMessages]);
}
