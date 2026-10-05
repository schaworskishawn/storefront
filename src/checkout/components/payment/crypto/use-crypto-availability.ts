"use client";

import { useEffect, useState } from "react";
import { getCheckoutTransport } from "@/checkout/lib/checkout-transport";
import {
	WVPAY_GATEWAY_ID,
	parseWvPayGatewayConfig,
	wvPayOffersCrypto,
} from "@/checkout/lib/payment/providers/wvpay";

export type CryptoAvailability = "loading" | "available" | "unavailable";

/** Asks the payments app (through Saleor) whether crypto is set up, so a shopper is never offered a dead button. */
export function useCryptoAvailability(checkoutId: string): CryptoAvailability {
	const [state, setState] = useState<CryptoAvailability>("loading");

	useEffect(() => {
		let cancelled = false;

		void getCheckoutTransport()
			.initializePaymentGateways({ checkoutId, paymentGateways: [{ id: WVPAY_GATEWAY_ID }] })
			.then((result) => {
				if (cancelled) return;
				const gateway = result.ok
					? result.data.gatewayConfigs?.find((config) => config.id === WVPAY_GATEWAY_ID)
					: undefined;
				const available =
					!!gateway && !gateway.errors?.length && wvPayOffersCrypto(parseWvPayGatewayConfig(gateway.data));
				setState(available ? "available" : "unavailable");
			})
			.catch(() => {
				if (!cancelled) setState("unavailable");
			});

		return () => {
			cancelled = true;
		};
	}, [checkoutId]);

	return state;
}
