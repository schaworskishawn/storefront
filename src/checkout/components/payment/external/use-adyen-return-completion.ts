"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useCheckoutGatewayMessages } from "@/checkout/hooks/use-checkout-gateway-messages";
import { useCheckoutPaymentMessages } from "@/checkout/hooks/use-checkout-payment-messages";
import { getCheckoutTransport } from "@/checkout/lib/checkout-transport";
import { markPaymentCompleting } from "@/checkout/lib/payment/checkout-payment-completion";
import { submitAdyenDetails } from "@/checkout/lib/payment/execute-adyen-payment";
import { finalizeCheckoutOrder } from "@/checkout/lib/payment/finalize-checkout-order";
import { clearPendingPayment, readPendingPayment } from "@/checkout/lib/payment/pending-payment-storage";
import { classifyAdyenResponse } from "@/checkout/lib/payment/providers/adyen";
import { waitForCheckoutPayment } from "@/checkout/lib/payment/wait-for-checkout-payment";
import { rethrowNextInternalError } from "@/checkout/lib/rethrow-next-internal-error";
import { getQueryParams } from "@/checkout/lib/utils/url";
import { reportExternalReturnFailure } from "./report-return-failure";

type Params = {
	checkoutId: string;
	onError: (message: string) => void;
};

/**
 * Finishes an Adyen payment after the shopper comes back from a lender or PayPal redirect: Adyen appends `redirectResult` to
 * the return URL, we send it (with the `paymentData` saved before the redirect) to Adyen through Saleor, and place the order
 * if it was approved. Does not need the Adyen SDK — only the checkout transport.
 */
export function useAdyenReturnCompletion({ checkoutId, onError }: Params) {
	const searchParams = useSearchParams()!;
	const paymentMessages = useCheckoutPaymentMessages();
	const gatewayMessages = useCheckoutGatewayMessages();
	/** Dedupes effect re-runs while Next `searchParams` still reflects the pre-clear return URL. */
	const attemptRef = useRef<string | null>(null);

	useEffect(() => {
		const { processingPayment, redirectResult, paymentIntent } = getQueryParams(searchParams);
		if (!processingPayment || typeof redirectResult !== "string" || !redirectResult || paymentIntent) {
			return;
		}
		if (attemptRef.current === redirectResult) {
			return;
		}
		attemptRef.current = redirectResult;

		const pending = readPendingPayment("adyen", checkoutId);
		if (!pending) {
			reportExternalReturnFailure("adyen", paymentMessages.sessionExpired, onError);
			return;
		}

		markPaymentCompleting(checkoutId);

		const complete = async () => {
			try {
				const details = await submitAdyenDetails({
					transactionId: pending.transactionId,
					data: {
						details: { redirectResult },
						...(pending.paymentData ? { paymentData: pending.paymentData } : {}),
					},
					messages: paymentMessages,
					gatewayMessages,
				});
				if (!details.ok) {
					reportExternalReturnFailure("adyen", details.message, onError);
					return;
				}

				const outcome = classifyAdyenResponse(details.response);
				if (outcome === "refused" || outcome === "action") {
					// A redirect result that asks for yet another browser step can't be continued without the Drop-in.
					reportExternalReturnFailure("adyen", gatewayMessages.paymentFailed, onError);
					return;
				}

				let channelSlug: string | undefined;
				if (outcome === "pending") {
					// The lender hasn't decided yet; Adyen tells Saleor by webhook. Give it a moment before giving up.
					const waited = await waitForCheckoutPayment({
						checkoutId,
						fetchCheckout: getCheckoutTransport().fetchCheckout,
						attempts: 15,
					});
					if (waited.status !== "ready") {
						reportExternalReturnFailure("adyen", paymentMessages.verificationUnavailable, onError);
						return;
					}
					channelSlug = waited.checkout.channel.slug;
				} else {
					const synced = await getCheckoutTransport().fetchCheckout(checkoutId);
					channelSlug = synced.ok ? synced.checkout?.channel.slug : undefined;
				}

				if (!channelSlug) {
					reportExternalReturnFailure("adyen", paymentMessages.channelUnresolved, onError);
					return;
				}

				clearPendingPayment("adyen");
				const completed = await finalizeCheckoutOrder(checkoutId, channelSlug);
				if (!completed.ok) {
					reportExternalReturnFailure("adyen", completed.error, onError);
				}
				// On success the page navigates to the order confirmation.
			} catch (error) {
				rethrowNextInternalError(error);
				console.error("Adyen redirect completion failed:", error);
				reportExternalReturnFailure("adyen", paymentMessages.unexpectedError, onError);
			}
		};

		void complete();
	}, [searchParams, checkoutId, onError, paymentMessages, gatewayMessages]);
}
