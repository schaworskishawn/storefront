import { PAYMENTS_GATEWAY_ID, type AuthorizeNetEnvironment } from "@/lib/payments-app/constants";
import { type PaymentGatewayLike } from "../types";

/**
 * The "Worldwide Vapor Payments" Saleor app (src/app/api/saleor-app/*, src/lib/payments-app/*) — card payments through
 * Authorize.net. Client-submit: the card form below owns the Pay button.
 */
export const WVPAY_GATEWAY_ID = PAYMENTS_GATEWAY_ID;

/** Shown when the app is on the checkout but the storefront flag is off. */
export const WVPAY_NOT_ENABLED_MESSAGE =
	"Card payments are not enabled in this environment. Set NEXT_PUBLIC_ENABLE_AUTHORIZENET_PAYMENTS=true on the storefront.";

export function isWvPayGateway(gatewayId: string): boolean {
	return gatewayId === WVPAY_GATEWAY_ID;
}

export function findWvPayGateway(
	gateways: ReadonlyArray<PaymentGatewayLike> | null | undefined,
): PaymentGatewayLike | undefined {
	return gateways?.find((gateway) => isWvPayGateway(gateway.id));
}

/** Opt-in only (no development default): a card form that charges real cards must be switched on deliberately. */
export function isWvPayEnabled(): boolean {
	if (process.env.ENABLE_AUTHORIZENET_PAYMENTS === "true") {
		return true;
	}
	return process.env.NEXT_PUBLIC_ENABLE_AUTHORIZENET_PAYMENTS === "true";
}

/** Server-side guard for transactionInitialize — blocks the gateway when the storefront flag is off. */
export function getWvPayGuardError(gatewayId: string | null | undefined): string | null {
	if (!gatewayId || !isWvPayGateway(gatewayId)) {
		return null;
	}
	return isWvPayEnabled() ? null : WVPAY_NOT_ENABLED_MESSAGE;
}

export type AuthorizeNetClientConfig = {
	environment: AuthorizeNetEnvironment;
	apiLoginId: string;
	clientKey: string;
};

export type WvPayGatewayConfig = {
	methods: string[];
	authorizenet: AuthorizeNetClientConfig | null;
};

const text = (value: unknown): string | null =>
	typeof value === "string" && value.trim() ? value.trim() : null;

/** Parses the gateway-initialize `data` the payments app returns. Null when it isn't usable. */
export function parseWvPayGatewayConfig(data: unknown): WvPayGatewayConfig | null {
	if (!data || typeof data !== "object") {
		return null;
	}

	const record = data as Record<string, unknown>;
	const methods = Array.isArray(record.methods)
		? record.methods.filter((method): method is string => typeof method === "string")
		: [];

	const raw = record.authorizenet;
	let authorizenet: AuthorizeNetClientConfig | null = null;
	if (raw && typeof raw === "object") {
		const config = raw as Record<string, unknown>;
		const apiLoginId = text(config.apiLoginId);
		const clientKey = text(config.clientKey);
		if (apiLoginId && clientKey) {
			authorizenet = {
				environment: config.environment === "production" ? "production" : "sandbox",
				apiLoginId,
				clientKey,
			};
		}
	}

	return { methods, authorizenet };
}
