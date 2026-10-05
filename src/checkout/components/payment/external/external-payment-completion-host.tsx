"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useLiveCheckoutSearchParams } from "@/checkout/lib/checkout-search-params";
import { readPendingPayment } from "@/checkout/lib/payment/pending-payment-storage";
import { useCheckoutPaymentReturnError } from "@/checkout/providers/checkout-payment-return-error";
import { useCheckoutSession } from "@/checkout/providers/checkout-session";
import { useAdyenReturnCompletion } from "./use-adyen-return-completion";
import { useCryptoReturnCompletion } from "./use-crypto-return-completion";

function AdyenReturnHandler({ checkoutId }: { checkoutId: string }) {
	const { setError } = useCheckoutPaymentReturnError();
	useAdyenReturnCompletion({ checkoutId, onError: setError });
	return null;
}

function CryptoReturnHandler({ checkoutId }: { checkoutId: string }) {
	const { setError } = useCheckoutPaymentReturnError();
	const t = useTranslations("checkout.payment.crypto");
	useCryptoReturnCompletion({ checkoutId, onError: setError, orderPlacedMessage: t("orderPlaced") });
	return null;
}

/**
 * Mounted at app shell level (next to the Stripe one) so the return from a lender redirect or the crypto provider's page keeps
 * running while the checkout shows its processing screen. Each handler only mounts for its own return URL.
 */
export function ExternalPaymentCompletionHost() {
	const { checkoutId } = useCheckoutSession();
	const searchParams = useSearchParams()!;
	const liveSearchParams = useLiveCheckoutSearchParams(searchParams);

	if (
		!checkoutId ||
		liveSearchParams.get("processingPayment") !== "true" ||
		liveSearchParams.get("payment_intent")
	) {
		return null;
	}

	if (liveSearchParams.get("redirectResult")) {
		return <AdyenReturnHandler checkoutId={checkoutId} />;
	}

	if (readPendingPayment("crypto", checkoutId)) {
		return <CryptoReturnHandler checkoutId={checkoutId} />;
	}

	return null;
}
