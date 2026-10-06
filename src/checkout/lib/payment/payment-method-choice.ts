export type PaymentMethodChoice = "card" | "installments" | "etransfer" | "adyen" | "crypto";

const CHOICES: readonly PaymentMethodChoice[] = ["card", "installments", "etransfer", "adyen", "crypto"];

const keyFor = (checkoutId: string) => `checkout:payment-method:${checkoutId}`;

/**
 * Remembers which method the shopper picked for this checkout. The payment step is unmounted while an order is being placed
 * (the "processing" screen replaces it), so without this a failed attempt would drop them back on the card tab.
 * Session storage can throw (private mode, blocked storage); the choice is a convenience, never required.
 */
export function readPaymentMethodChoice(checkoutId: string): PaymentMethodChoice | null {
	try {
		const value = window.sessionStorage.getItem(keyFor(checkoutId));
		return CHOICES.find((choice) => choice === value) ?? null;
	} catch {
		return null;
	}
}

export function writePaymentMethodChoice(checkoutId: string, choice: PaymentMethodChoice): void {
	try {
		window.sessionStorage.setItem(keyFor(checkoutId), choice);
	} catch {
		/* ignore */
	}
}
