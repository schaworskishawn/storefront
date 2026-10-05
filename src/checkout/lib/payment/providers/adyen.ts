import { type PaymentGatewayLike } from "../types";

/**
 * Saleor's Adyen app gateway id.
 * @see https://docs.saleor.io/developer/app-store/apps/adyen/storefront
 *
 * Adyen is offered *next to* the card gateway, not instead of it: this storefront uses it for PayPal and the
 * buy-now-pay-later methods, while cards stay on Authorize.net / Stripe. So it is not in the primary-gateway registry
 * (`INTEGRATED_GATEWAYS`); the payment step lists it as an extra method (see `payment-methods.ts`).
 */
export const ADYEN_GATEWAY_ID = "app.saleor.adyen";

/** Shown when Adyen is on the checkout but the storefront flag is off. */
export const ADYEN_NOT_ENABLED_MESSAGE =
	"Adyen payments are not enabled in this environment. Set NEXT_PUBLIC_ENABLE_ADYEN_PAYMENTS=true on the storefront.";

export function isAdyenGateway(gatewayId: string): boolean {
	return gatewayId === ADYEN_GATEWAY_ID;
}

export function findAdyenGateway(
	gateways: ReadonlyArray<PaymentGatewayLike> | null | undefined,
): PaymentGatewayLike | undefined {
	return gateways?.find((gateway) => isAdyenGateway(gateway.id));
}

/** Opt-in only (no development default): it moves real money through PayPal and lenders, so switch it on deliberately. */
export function isAdyenEnabled(): boolean {
	if (process.env.ENABLE_ADYEN_PAYMENTS === "true") {
		return true;
	}
	return process.env.NEXT_PUBLIC_ENABLE_ADYEN_PAYMENTS === "true";
}

/** Server-side guard for transactionInitialize — blocks the gateway when the storefront flag is off. */
export function getAdyenGuardError(gatewayId: string | null | undefined): string | null {
	if (!gatewayId || !isAdyenGateway(gatewayId)) {
		return null;
	}
	return isAdyenEnabled() ? null : ADYEN_NOT_ENABLED_MESSAGE;
}

/**
 * Adyen payment method types shown in the checkout by default: PayPal and the buy-now-pay-later lenders. Cards are
 * deliberately absent. Override with NEXT_PUBLIC_ADYEN_PAYMENT_METHODS (comma-separated Adyen `type` values).
 */
export const DEFAULT_ADYEN_PAYMENT_METHODS = [
	"paypal",
	"klarna",
	"klarna_account",
	"klarna_paynow",
	"afterpaytouch",
	"clearpay",
	"affirm",
] as const;

export function allowedAdyenPaymentMethods(
	raw: string | undefined = process.env.NEXT_PUBLIC_ADYEN_PAYMENT_METHODS,
): string[] {
	const parsed = (raw ?? "")
		.split(",")
		.map((value) => value.trim().toLowerCase())
		.filter(Boolean);
	return parsed.length > 0 ? parsed : [...DEFAULT_ADYEN_PAYMENT_METHODS];
}

export const ADYEN_ENVIRONMENTS = [
	"test",
	"live",
	"live-us",
	"live-au",
	"live-apse",
	"live-in",
	"live-nea",
] as const;
export type AdyenEnvironment = (typeof ADYEN_ENVIRONMENTS)[number];

/**
 * The Saleor Adyen app only reports TEST or LIVE, but Adyen's live endpoint depends on the merchant account's region
 * (a US account needs `live-us`). A test account always stays on `test`, whatever the override says.
 */
export function resolveAdyenEnvironment(
	reported: unknown,
	override: string | undefined = process.env.NEXT_PUBLIC_ADYEN_ENVIRONMENT,
): AdyenEnvironment {
	if (typeof reported !== "string" || reported.trim().toUpperCase() !== "LIVE") {
		return "test";
	}
	const wanted = override?.trim().toLowerCase();
	return (ADYEN_ENVIRONMENTS as readonly string[]).includes(wanted ?? "") && wanted !== "test"
		? (wanted as AdyenEnvironment)
		: "live";
}

export type AdyenPaymentMethod = { type: string; name?: string; [key: string]: unknown };
export type AdyenPaymentMethodsResponse = { paymentMethods: AdyenPaymentMethod[] };

export type AdyenGatewayConfig = {
	clientKey: string;
	environment: AdyenEnvironment;
	/** The `/paymentMethods` response narrowed to the methods this storefront offers (cards and stored cards removed). */
	paymentMethodsResponse: AdyenPaymentMethodsResponse;
};

/**
 * Parses the `paymentGatewayInitialize` data from the Adyen app. Returns null when it isn't usable (no client key, or no
 * response). `paymentMethodsResponse.paymentMethods` can be empty — Adyen offers nothing to this shopper/amount/country.
 */
export function parseAdyenGatewayConfig(
	data: unknown,
	allowed: readonly string[] = allowedAdyenPaymentMethods(),
): AdyenGatewayConfig | null {
	if (!data || typeof data !== "object") {
		return null;
	}

	const record = data as Record<string, unknown>;
	const clientKey = typeof record.clientKey === "string" ? record.clientKey.trim() : "";
	const response = record.paymentMethodsResponse;
	if (!clientKey || !response || typeof response !== "object") {
		return null;
	}

	const rawMethods = (response as { paymentMethods?: unknown }).paymentMethods;
	const paymentMethods = Array.isArray(rawMethods)
		? rawMethods.filter(
				(method): method is AdyenPaymentMethod =>
					!!method &&
					typeof method === "object" &&
					typeof (method as { type?: unknown }).type === "string" &&
					allowed.includes((method as { type: string }).type.toLowerCase()),
			)
		: [];

	return {
		clientKey,
		environment: resolveAdyenEnvironment(record.environment),
		paymentMethodsResponse: { paymentMethods },
	};
}

/** Adyen wants the amount in minor units (cents), and some currencies have no decimals. */
export function toMinorUnits(amount: number, currency: string): number {
	let digits = 2;
	try {
		digits =
			new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions().maximumFractionDigits ??
			2;
	} catch {
		/* unknown currency code: assume two decimals */
	}
	return Math.round(amount * 10 ** digits);
}

/** Drop-in locales Adyen ships translations for that match this storefront's languages. */
const ADYEN_LOCALES: Record<string, string> = {
	en: "en-US",
	de: "de-DE",
	fr: "fr-FR",
	fi: "fi-FI",
	nb: "no-NO",
	pl: "pl-PL",
};

export function toAdyenLocale(locale: string | null | undefined): string {
	return ADYEN_LOCALES[(locale ?? "en").toLowerCase().split("-")[0] ?? "en"] ?? "en-US";
}

/** What Adyen's `/payments` and `/payments/details` calls come back with, as the Saleor app relays it. */
export type AdyenResponse = {
	resultCode: string;
	/** An Adyen `action` object (redirect, 3-D Secure, QR code…) the Drop-in must act on; opaque to us. */
	action?: Record<string, unknown>;
	refusalReason?: string;
};

function parseAdyenResponse(value: unknown): AdyenResponse | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const record = value as Record<string, unknown>;
	if (typeof record.resultCode !== "string") {
		return null;
	}
	return {
		resultCode: record.resultCode,
		action:
			record.action && typeof record.action === "object"
				? (record.action as Record<string, unknown>)
				: undefined,
		refusalReason: typeof record.refusalReason === "string" ? record.refusalReason : undefined,
	};
}

/** `transactionInitialize` → `data.paymentResponse`. */
export function parseAdyenPaymentResponse(data: unknown): AdyenResponse | null {
	return parseAdyenResponse((data as { paymentResponse?: unknown } | null | undefined)?.paymentResponse);
}

/** `transactionProcess` → `data.paymentDetailsResponse`. */
export function parseAdyenDetailsResponse(data: unknown): AdyenResponse | null {
	return parseAdyenResponse(
		(data as { paymentDetailsResponse?: unknown } | null | undefined)?.paymentDetailsResponse,
	);
}

export type AdyenOutcome =
	/** More to do in the browser first: a redirect, a 3-D Secure challenge, a QR code. */
	| "action"
	/** Adyen authorised the payment. */
	| "authorised"
	/** Accepted but not final (e.g. a lender still reviewing); the result arrives later by webhook. */
	| "pending"
	| "refused";

export function classifyAdyenResponse(response: AdyenResponse): AdyenOutcome {
	if (response.action) {
		return "action";
	}
	switch (response.resultCode) {
		case "Authorised":
			return "authorised";
		case "Pending":
		case "Received":
		case "PresentToShopper":
			return "pending";
		default:
			return "refused";
	}
}
