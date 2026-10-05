import { isCryptoPaymentEnabled } from "./providers/crypto";
import { findAdyenGateway, isAdyenEnabled } from "./providers/adyen";
import { findWvPayGateway } from "./providers/wvpay";
import { type PaymentGatewayLike } from "./types";
import { type PaymentMethodChoice } from "./payment-method-choice";

/** Which payment methods this checkout can offer next to each other (each is shown only when it applies). */
export type PaymentMethodOffers = {
	/** The primary card gateway (Authorize.net / Stripe) is integrated. */
	card: boolean;
	etransfer: boolean;
	/** PayPal and buy-now-pay-later through the Adyen app. */
	adyen: boolean;
	crypto: boolean;
};

/** Display order: cards first, then the wallet/lender options, then the pay-after-order and crypto methods. */
const METHOD_ORDER: readonly PaymentMethodChoice[] = ["card", "adyen", "etransfer", "crypto"];

export function listPaymentMethods(offers: PaymentMethodOffers): PaymentMethodChoice[] {
	return METHOD_ORDER.filter((method) => offers[method]);
}

/**
 * The method the shopper is on: their pick when it is still on offer, otherwise the first one available. With nothing on
 * offer it stays "card" so the usual "no gateway configured" alerts keep showing.
 */
export function resolvePaymentMethod(
	available: readonly PaymentMethodChoice[],
	picked: PaymentMethodChoice,
): PaymentMethodChoice {
	if (available.includes(picked)) {
		return picked;
	}
	return available[0] ?? "card";
}

/**
 * The extra methods that depend on the checkout's gateways and the storefront flags (e-Transfer depends on currency and
 * country, so the payment step works that one out itself). Free orders take no payment, so none apply.
 */
export function getGatewayPaymentOffers(
	gateways: ReadonlyArray<PaymentGatewayLike> | null | undefined,
	isFreeOrder: boolean,
): Pick<PaymentMethodOffers, "adyen" | "crypto"> {
	if (isFreeOrder) {
		return { adyen: false, crypto: false };
	}
	return {
		adyen: isAdyenEnabled() && !!findAdyenGateway(gateways),
		// Crypto rides on the Worldwide Vapor Payments app, so it needs that gateway on the checkout as well as its own flag.
		crypto: isCryptoPaymentEnabled() && !!findWvPayGateway(gateways),
	};
}

/** True when the checkout carries gateways that are only there for the extra methods, so they aren't "unsupported". */
export function isExtraMethodGateway(gateway: PaymentGatewayLike): boolean {
	return (
		(isAdyenEnabled() && findAdyenGateway([gateway]) !== undefined) ||
		(isCryptoPaymentEnabled() && findWvPayGateway([gateway]) !== undefined)
	);
}
