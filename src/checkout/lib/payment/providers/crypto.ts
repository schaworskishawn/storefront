import { isWvPayCryptoRequest, isWvPayGateway } from "./wvpay";

/**
 * Hosted crypto checkout. It is served by the same "Worldwide Vapor Payments" Saleor app as cards (`method: "crypto"` on
 * `transactionInitialize`), so there is no gateway of its own — the storefront flag below decides whether it is offered.
 *
 * The shopper is sent to the provider's hosted page to pay, and the payment is confirmed by the provider calling our IPN
 * route (src/app/api/saleor-app/crypto/ipn), never by the shopper's browser.
 */

/** Shown when a crypto payment is attempted but the storefront flag is off. */
export const CRYPTO_NOT_ENABLED_MESSAGE =
	"Crypto payments are not enabled in this environment. Set NEXT_PUBLIC_ENABLE_CRYPTO_PAYMENTS=true on the storefront.";

/** Opt-in only (no development default): crypto payments are irreversible, so switch them on deliberately. */
export function isCryptoPaymentEnabled(): boolean {
	if (process.env.ENABLE_CRYPTO_PAYMENTS === "true") {
		return true;
	}
	return process.env.NEXT_PUBLIC_ENABLE_CRYPTO_PAYMENTS === "true";
}

/** Server-side guard for transactionInitialize — blocks crypto requests when the storefront flag is off. */
export function getCryptoPaymentGuardError(
	gatewayId: string | null | undefined,
	data: unknown,
): string | null {
	if (!gatewayId || !isWvPayGateway(gatewayId) || !isWvPayCryptoRequest(data)) {
		return null;
	}
	return isCryptoPaymentEnabled() ? null : CRYPTO_NOT_ENABLED_MESSAGE;
}

export type CryptoInvoice = { invoiceId: string; invoiceUrl: string };

/**
 * The hosted payment page is the only place we ever send the browser away to, so only the provider's own https pages are
 * accepted — a tampered or misconfigured response can't turn the checkout into an open redirect.
 */
export function isTrustedCryptoInvoiceUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return (
			url.protocol === "https:" &&
			(url.hostname === "nowpayments.io" || url.hostname.endsWith(".nowpayments.io"))
		);
	} catch {
		return false;
	}
}

/** Reads the invoice out of `transactionInitialize`'s `data`. Null when it's missing or the URL isn't trusted. */
export function parseCryptoInvoice(data: unknown): CryptoInvoice | null {
	if (!data || typeof data !== "object") {
		return null;
	}
	const record = data as Record<string, unknown>;
	const invoiceUrl = typeof record.invoiceUrl === "string" ? record.invoiceUrl : "";
	if (!isTrustedCryptoInvoiceUrl(invoiceUrl)) {
		return null;
	}
	return { invoiceId: typeof record.invoiceId === "string" ? record.invoiceId : "", invoiceUrl };
}
