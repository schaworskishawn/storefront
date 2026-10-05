import { PAYMENTS_GATEWAY_ID } from "@/lib/payments-app/constants";
import { type PaymentGatewayLike } from "../types";

/**
 * The "Worldwide Vapor Payments" Saleor app (src/app/api/saleor-app/*, src/lib/payments-app/*) — hosted crypto checkout.
 * It has no payment form of its own and is never the primary gateway: crypto is an extra payment method
 * (see `payment-methods.ts` and `crypto.ts`), offered when this gateway is on the checkout and the crypto flag is set.
 */
export const WVPAY_GATEWAY_ID = PAYMENTS_GATEWAY_ID;

export function isWvPayGateway(gatewayId: string): boolean {
	return gatewayId === WVPAY_GATEWAY_ID;
}

export function findWvPayGateway(
	gateways: ReadonlyArray<PaymentGatewayLike> | null | undefined,
): PaymentGatewayLike | undefined {
	return gateways?.find((gateway) => isWvPayGateway(gateway.id));
}

/** Crypto requests carry `method: "crypto"` in the `transactionInitialize` data. */
export function isWvPayCryptoRequest(data: unknown): boolean {
	return !!data && typeof data === "object" && (data as { method?: unknown }).method === "crypto";
}

export type WvPayGatewayConfig = {
	methods: string[];
};

/** The payments app lists `"crypto"` in `methods` once the crypto provider's keys are set. */
export function wvPayOffersCrypto(config: Pick<WvPayGatewayConfig, "methods"> | null | undefined): boolean {
	return !!config?.methods.includes("crypto");
}

/** Parses the gateway-initialize `data` the payments app returns. Null when it isn't usable. */
export function parseWvPayGatewayConfig(data: unknown): WvPayGatewayConfig | null {
	if (!data || typeof data !== "object") {
		return null;
	}

	const { methods } = data as { methods?: unknown };
	return {
		methods: Array.isArray(methods)
			? methods.filter((method): method is string => typeof method === "string")
			: [],
	};
}
