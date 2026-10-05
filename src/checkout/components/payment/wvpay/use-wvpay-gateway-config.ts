"use client";

import { useEffect, useState } from "react";
import { type CheckoutFragment } from "@/checkout/graphql";
import { getCheckoutTransport } from "@/checkout/lib/checkout-transport";
import {
	WVPAY_GATEWAY_ID,
	parseWvPayGatewayConfig,
	type AuthorizeNetClientConfig,
} from "@/checkout/lib/payment/providers/wvpay";

export type WvPayConfigState =
	| { status: "loading" }
	| { status: "ready"; authorizenet: AuthorizeNetClientConfig }
	| { status: "error"; reason: "request" | "not_configured"; message?: string };

/** Asks Saleor (→ the payments app) for the browser-safe Authorize.net settings. */
export function useWvPayGatewayConfig(checkout: CheckoutFragment): WvPayConfigState {
	const [state, setState] = useState<WvPayConfigState>({ status: "loading" });
	const checkoutId = checkout.id;

	useEffect(() => {
		let cancelled = false;

		void getCheckoutTransport()
			.initializePaymentGateways({ checkoutId, paymentGateways: [{ id: WVPAY_GATEWAY_ID }] })
			.then((result) => {
				if (cancelled) return;
				if (!result.ok) {
					setState({ status: "error", reason: "request", message: result.error });
					return;
				}

				const gateway = result.data.gatewayConfigs?.find((config) => config.id === WVPAY_GATEWAY_ID);
				if (gateway?.errors?.length) {
					setState({ status: "error", reason: "request", message: gateway.errors[0]?.message ?? undefined });
					return;
				}

				const parsed = parseWvPayGatewayConfig(gateway?.data);
				if (!parsed?.authorizenet || !parsed.methods.includes("authorizenet")) {
					setState({ status: "error", reason: "not_configured" });
					return;
				}

				setState({ status: "ready", authorizenet: parsed.authorizenet });
			})
			.catch(() => {
				if (!cancelled) setState({ status: "error", reason: "request" });
			});

		return () => {
			cancelled = true;
		};
	}, [checkoutId]);

	return state;
}
