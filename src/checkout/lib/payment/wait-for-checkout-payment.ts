import { type CheckoutFetchResult, type ServerCheckout } from "@/checkout/lib/checkout-types";
import { isCheckoutReadyToComplete } from "@/checkout/lib/payment/checkout-payment-status";

export type WaitForCheckoutPaymentResult =
	| { status: "ready"; checkout: ServerCheckout }
	/** Still not covered when we ran out of patience — the payment may yet confirm. */
	| { status: "timeout" }
	/** Saleor couldn't be read on the last attempt, so we can't say either way. */
	| { status: "unavailable" }
	/**
	 * The checkout no longer exists. After a payment this normally means Saleor already turned it into an order (channels can
	 * complete fully-paid checkouts on their own), so the shopper should look for the confirmation email.
	 */
	| { status: "gone" }
	| { status: "cancelled" };

type Params = {
	checkoutId: string;
	fetchCheckout: (checkoutId: string) => Promise<CheckoutFetchResult>;
	/** How many times to look (the first look is immediate). */
	attempts?: number;
	intervalMs?: number;
	/** Return true to stop early (the shopper left, or started over). */
	isCancelled?: () => boolean;
	sleep?: (ms: number) => Promise<void>;
};

/** One missing read can be a blip; the checkout is only called gone after this many in a row. */
const MISSING_READS_BEFORE_GONE = 2;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Watches a checkout until Saleor says it is paid. Used for payments that confirm *after* the shopper is back on the page —
 * a crypto transfer, or a lender's "pending" result — where the money is reported to Saleor by webhook, not by the browser.
 */
export async function waitForCheckoutPayment({
	checkoutId,
	fetchCheckout,
	attempts = 20,
	intervalMs = 3000,
	isCancelled,
	sleep = defaultSleep,
}: Params): Promise<WaitForCheckoutPaymentResult> {
	let lastRead: "ok" | "failed" = "failed";
	let missingInARow = 0;

	for (let attempt = 0; attempt < attempts; attempt++) {
		if (attempt > 0) {
			await sleep(intervalMs);
		}
		if (isCancelled?.()) {
			return { status: "cancelled" };
		}

		let result: CheckoutFetchResult;
		try {
			result = await fetchCheckout(checkoutId);
		} catch {
			lastRead = "failed";
			continue;
		}

		if (!result.ok) {
			lastRead = "failed";
			continue;
		}

		lastRead = "ok";
		if (!result.checkout) {
			missingInARow += 1;
			if (missingInARow >= MISSING_READS_BEFORE_GONE) {
				return { status: "gone" };
			}
			continue;
		}

		missingInARow = 0;
		if (isCheckoutReadyToComplete(result.checkout)) {
			return { status: "ready", checkout: result.checkout };
		}
	}

	return { status: lastRead === "ok" ? "timeout" : "unavailable" };
}
