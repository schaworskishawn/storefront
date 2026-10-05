import { type ReadonlyURLSearchParams } from "next/navigation";
import { createQueryString } from "@/checkout/lib/utils/url";

/**
 * Where a payment that leaves the page (a lender redirect, the crypto provider's hosted page) sends the shopper back to: the
 * payment step of this same checkout, flagged `processingPayment` so the checkout shows its processing screen while the
 * return handler finishes the job. Any leftover redirect result from an earlier attempt is dropped.
 */
export function buildPaymentReturnUrl(
	searchParams: ReadonlyURLSearchParams,
	location: { origin: string; pathname: string },
): string {
	const query = createQueryString(searchParams, {
		processingPayment: "true",
		redirectResult: null,
		transaction: null,
		step: "payment",
	});

	return `${location.origin}${location.pathname}?${query}`;
}
