/**
 * A payment that leaves the page — a redirect to a lender, PayPal or the crypto provider's hosted page — has to be picked up
 * again when the shopper comes back. This remembers which Saleor transaction belongs to the attempt (and, for Adyen, the
 * `paymentData` the redirect result must be sent back with). Session storage only: it is per-tab and gone when the tab closes.
 */

export type PendingPaymentProvider = "adyen" | "crypto";

export type PendingPayment = {
	checkoutId: string;
	transactionId: string;
	/** Adyen only: the opaque `paymentData` from the redirect action, needed to complete the payment on return. */
	paymentData?: string;
	/** Crypto only: the hosted payment page, so a shopper who came back early can return to it. */
	invoiceUrl?: string;
};

const keyFor = (provider: PendingPaymentProvider) => `checkout:pending-payment:${provider}`;

export function writePendingPayment(provider: PendingPaymentProvider, pending: PendingPayment): void {
	try {
		sessionStorage.setItem(keyFor(provider), JSON.stringify(pending));
	} catch {
		/* storage unavailable: the return handler will report the session as expired */
	}
}

/** The pending attempt for this checkout, or null. An attempt stored for a different checkout is never returned. */
export function readPendingPayment(
	provider: PendingPaymentProvider,
	checkoutId: string,
): PendingPayment | null {
	try {
		const raw = sessionStorage.getItem(keyFor(provider));
		if (!raw) {
			return null;
		}
		const value = JSON.parse(raw) as Partial<PendingPayment> | null;
		if (
			!value ||
			typeof value.transactionId !== "string" ||
			!value.transactionId ||
			value.checkoutId !== checkoutId
		) {
			return null;
		}
		return {
			checkoutId,
			transactionId: value.transactionId,
			paymentData: typeof value.paymentData === "string" ? value.paymentData : undefined,
			invoiceUrl: typeof value.invoiceUrl === "string" ? value.invoiceUrl : undefined,
		};
	} catch {
		return null;
	}
}

export function clearPendingPayment(provider: PendingPaymentProvider): void {
	try {
		sessionStorage.removeItem(keyFor(provider));
	} catch {
		/* ignore */
	}
}
