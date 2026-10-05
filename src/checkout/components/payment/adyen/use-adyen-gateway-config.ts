"use client";

import { useEffect, useState } from "react";
import { getCheckoutTransport } from "@/checkout/lib/checkout-transport";
import {
	ADYEN_GATEWAY_ID,
	parseAdyenGatewayConfig,
	type AdyenGatewayConfig,
} from "@/checkout/lib/payment/providers/adyen";

export type AdyenConfigState =
	| { status: "loading" }
	| { status: "ready"; config: AdyenGatewayConfig }
	/** Adyen answered but offers none of PayPal / pay-later for this order (amount, country or account settings). */
	| { status: "unavailable" }
	| { status: "error"; message?: string };

/**
 * Asks Saleor (→ the Adyen app → Adyen `/paymentMethods`) for the client key and the methods on offer. The answer depends on
 * the checkout's total and country, so the component is keyed on those and remounts when they change.
 */
export function useAdyenGatewayConfig(checkoutId: string): AdyenConfigState {
	const [state, setState] = useState<AdyenConfigState>({ status: "loading" });

	useEffect(() => {
		let cancelled = false;

		void getCheckoutTransport()
			.initializePaymentGateways({ checkoutId, paymentGateways: [{ id: ADYEN_GATEWAY_ID }] })
			.then((result) => {
				if (cancelled) return;
				if (!result.ok) {
					setState({ status: "error", message: result.error });
					return;
				}

				const gateway = result.data.gatewayConfigs?.find((config) => config.id === ADYEN_GATEWAY_ID);
				if (gateway?.errors?.length) {
					setState({ status: "error", message: gateway.errors[0]?.message ?? undefined });
					return;
				}

				const config = parseAdyenGatewayConfig(gateway?.data);
				if (!config) {
					setState({ status: "error" });
					return;
				}

				setState(
					config.paymentMethodsResponse.paymentMethods.length > 0
						? { status: "ready", config }
						: { status: "unavailable" },
				);
			})
			.catch(() => {
				if (!cancelled) setState({ status: "error" });
			});

		return () => {
			cancelled = true;
		};
	}, [checkoutId]);

	return state;
}
