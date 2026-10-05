"use client";

import "@adyen/adyen-web/styles/adyen.css";

import { useEffect, useRef, useState, type FC } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { PaymentAction, ResultCode } from "@adyen/adyen-web";
import { type CheckoutFragment } from "@/checkout/graphql";
import { useCheckoutGatewayMessages } from "@/checkout/hooks/use-checkout-gateway-messages";
import { useCheckoutPaymentMessages } from "@/checkout/hooks/use-checkout-payment-messages";
import { buildPaymentReturnUrl } from "@/checkout/lib/payment/build-payment-return-url";
import {
	getCheckoutPayAmount,
	getCheckoutPayCurrency,
	type CheckoutPriceChangeNotice,
} from "@/checkout/lib/payment/checkout-pay-amount";
import {
	clearPaymentCompleting,
	markPaymentCompleting,
} from "@/checkout/lib/payment/checkout-payment-completion";
import { submitAdyenDetails, submitAdyenPayment } from "@/checkout/lib/payment/execute-adyen-payment";
import { finalizeCheckoutOrder } from "@/checkout/lib/payment/finalize-checkout-order";
import { clearPendingPayment, readPendingPayment } from "@/checkout/lib/payment/pending-payment-storage";
import { getCheckoutTransport } from "@/checkout/lib/checkout-transport";
import {
	allowedAdyenPaymentMethods,
	toAdyenLocale,
	toMinorUnits,
	type AdyenGatewayConfig,
} from "@/checkout/lib/payment/providers/adyen";
import { waitForCheckoutPayment } from "@/checkout/lib/payment/wait-for-checkout-payment";
import { rethrowNextInternalError } from "@/checkout/lib/rethrow-next-internal-error";
import { useCheckoutData } from "@/checkout/providers/checkout-data";
import { LoadingSpinner } from "@/checkout/ui-kit/loading-spinner";
import { type StripeBillingContext } from "@/checkout/components/payment/stripe/stripe-billing-context";
import { useAdyenGatewayConfig } from "./use-adyen-gateway-config";

type AdyenPaymentProps = {
	checkout: CheckoutFragment;
	billing: StripeBillingContext;
	onPaymentError: (message: string) => void;
	onBillingErrors: (errors: Record<string, string>, focusField?: string) => void;
	onPriceChangeNotice: (notice: CheckoutPriceChangeNotice) => void;
	onPaymentActivityChange?: (active: boolean) => void;
};

/**
 * PayPal and buy-now-pay-later through Adyen's Drop-in. Drop-in draws the method list and owns the Pay button; the callbacks
 * below do the Saleor side (see `execute-adyen-payment.ts`). Mounted lazily so the Adyen SDK and its CSS load only when the
 * shopper opens this tab.
 */
export const AdyenPayment: FC<AdyenPaymentProps> = (props) => {
	const t = useTranslations("checkout.payment.adyen");
	const config = useAdyenGatewayConfig(props.checkout.id);

	if (config.status === "loading") {
		return (
			<div className="wv-card flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
				<LoadingSpinner />
				{t("loading")}
			</div>
		);
	}

	if (config.status === "unavailable") {
		return <Notice message={t("unavailable")} />;
	}

	if (config.status === "error") {
		return <Notice message={config.message ?? t("loadFailed")} />;
	}

	return <AdyenDropin {...props} gatewayConfig={config.config} />;
};

const Notice: FC<{ message: string }> = ({ message }) => (
	<div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4" role="alert">
		<AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
		<p className="text-sm text-amber-800">{message}</p>
	</div>
);

type DropinProps = AdyenPaymentProps & { gatewayConfig: AdyenGatewayConfig };

const AdyenDropin: FC<DropinProps> = (props) => {
	const t = useTranslations("checkout.payment.adyen");
	const locale = useLocale();
	const searchParams = useSearchParams()!;
	const paymentMessages = useCheckoutPaymentMessages();
	const gatewayMessages = useCheckoutGatewayMessages();
	const { refreshCheckout } = useCheckoutData();

	const containerRef = useRef<HTMLDivElement>(null);
	const [mountState, setMountState] = useState<"mounting" | "ready" | "error">("mounting");
	const [notice, setNotice] = useState<string | null>(null);

	// The Drop-in is created once per amount/country, but its callbacks must always see the latest billing form and totals.
	const latest = useRef({
		...props,
		refreshCheckout,
		paymentMessages,
		gatewayMessages,
		searchParams,
		pendingNotice: "",
	});
	useEffect(() => {
		latest.current = {
			...props,
			refreshCheckout,
			paymentMessages,
			gatewayMessages,
			searchParams,
			pendingNotice: t("pendingApproval"),
		};
	});

	const transactionIdRef = useRef<string | null>(null);
	const lastErrorRef = useRef<string | null>(null);

	const amount = getCheckoutPayAmount(props.checkout);
	const currency = getCheckoutPayCurrency(props.checkout);
	const minorAmount = amount !== null && currency ? toMinorUnits(amount, currency) : null;
	const countryCode =
		props.checkout.shippingAddress?.country?.code ?? props.checkout.billingAddress?.country?.code ?? "US";
	const { gatewayConfig } = props;

	useEffect(() => {
		const container = containerRef.current;
		if (!container || minorAmount === null || !currency) {
			return;
		}

		let cancelled = false;
		let dropin: { unmount: () => void } | null = null;

		const fail = (message: string, actions?: { reject: () => void }) => {
			lastErrorRef.current = message;
			latest.current.onPaymentError(message);
			latest.current.onPaymentActivityChange?.(false);
			actions?.reject();
		};

		/** Drop-in says the payment went through (or is pending approval): place the order. */
		const finish = async (resultCode: string) => {
			const ctx = latest.current;
			const checkoutId = ctx.checkout.id;

			try {
				if (resultCode !== "Authorised") {
					// Pending / Received: a lender is still deciding and tells Saleor by webhook. Wait a little for it.
					setNotice(ctx.pendingNotice);
					const waited = await waitForCheckoutPayment({
						checkoutId,
						fetchCheckout: getCheckoutTransport().fetchCheckout,
						attempts: 15,
					});
					if (waited.status !== "ready") {
						fail(ctx.paymentMessages.verificationUnavailable);
						return;
					}
					setNotice(null);
				}

				markPaymentCompleting(checkoutId);
				clearPendingPayment("adyen");
				const completed = await finalizeCheckoutOrder(checkoutId, ctx.checkout.channel.slug);
				if (!completed.ok) {
					try {
						await ctx.refreshCheckout();
					} catch (error) {
						rethrowNextInternalError(error);
					}
					clearPaymentCompleting();
					fail(completed.error);
				}
				// On success the page navigates to the order confirmation.
			} catch (error) {
				rethrowNextInternalError(error);
				console.error("Adyen order completion failed:", error);
				clearPaymentCompleting();
				fail(ctx.paymentMessages.interruptedAfterAuthorize);
			}
		};

		const start = async () => {
			try {
				const sdk = await import("@adyen/adyen-web");
				if (cancelled) return;

				const allowed = allowedAdyenPaymentMethods();
				const core = await sdk.AdyenCheckout({
					environment: gatewayConfig.environment,
					clientKey: gatewayConfig.clientKey,
					locale: toAdyenLocale(locale),
					countryCode,
					amount: { value: minorAmount, currency },
					paymentMethodsResponse: gatewayConfig.paymentMethodsResponse as never,
					allowPaymentMethods: allowed,

					onSubmit: (state, _component, actions) => {
						void (async () => {
							const ctx = latest.current;
							lastErrorRef.current = null;
							ctx.onPaymentError("");
							ctx.onPaymentActivityChange?.(true);

							const result = await submitAdyenPayment({
								checkout: ctx.checkout,
								billing: ctx.billing,
								refreshCheckout: ctx.refreshCheckout,
								stateData: state.data as unknown as Record<string, unknown>,
								returnUrl: buildPaymentReturnUrl(ctx.searchParams, {
									origin: window.location.origin,
									pathname: window.location.pathname,
								}),
								origin: window.location.origin,
								messages: ctx.paymentMessages,
								gatewayMessages: ctx.gatewayMessages,
							});

							if (!result.ok) {
								if (result.kind === "billing") {
									ctx.onBillingErrors(result.errors, result.focusField);
									ctx.onPaymentActivityChange?.(false);
									actions.reject();
								} else if (result.kind === "price_change") {
									ctx.onPriceChangeNotice(result.notice);
									ctx.onPaymentActivityChange?.(false);
									actions.reject();
								} else {
									fail(result.message, actions);
								}
								return;
							}

							transactionIdRef.current = result.transactionId;
							actions.resolve({
								resultCode: result.response.resultCode as ResultCode,
								action: result.response.action as unknown as PaymentAction | undefined,
							});
						})();
					},

					onAdditionalDetails: (state, _component, actions) => {
						void (async () => {
							const ctx = latest.current;
							const transactionId =
								transactionIdRef.current ?? readPendingPayment("adyen", ctx.checkout.id)?.transactionId;
							if (!transactionId) {
								fail(ctx.paymentMessages.sessionExpired, actions);
								return;
							}

							const result = await submitAdyenDetails({
								transactionId,
								data: state.data as unknown as Record<string, unknown>,
								messages: ctx.paymentMessages,
								gatewayMessages: ctx.gatewayMessages,
							});
							if (!result.ok) {
								fail(result.message, actions);
								return;
							}

							actions.resolve({
								resultCode: result.response.resultCode as ResultCode,
								action: result.response.action as unknown as PaymentAction | undefined,
							});
						})();
					},

					onPaymentCompleted: (data) => {
						void finish(data.resultCode);
					},

					onPaymentFailed: () => {
						// Our own handlers already showed the specific reason; this covers Adyen refusing on its side.
						const message = lastErrorRef.current ?? latest.current.gatewayMessages.paymentFailed;
						fail(message);
					},

					onError: (error) => {
						// Shoppers closing the PayPal window count as an error with name "CANCEL"; that's not worth a banner.
						if (error?.name !== "CANCEL") {
							console.error("Adyen Drop-in error:", error);
							latest.current.onPaymentError(latest.current.paymentMessages.unexpectedError);
						}
						latest.current.onPaymentActivityChange?.(false);
					},
				});
				if (cancelled) return;

				dropin = new sdk.Dropin(core, {
					paymentMethodComponents: [sdk.PayPal, sdk.Klarna, sdk.Affirm, sdk.AfterPay, sdk.Redirect],
					openFirstPaymentMethod: false,
					showStoredPaymentMethods: false,
				}).mount(container);
				setMountState("ready");
			} catch (error) {
				console.error("Adyen Drop-in failed to start:", error);
				if (!cancelled) setMountState("error");
			}
		};

		void start();

		return () => {
			cancelled = true;
			try {
				dropin?.unmount();
			} catch {
				/* already gone */
			}
		};
	}, [gatewayConfig, minorAmount, currency, countryCode, locale]);

	if (mountState === "error") {
		return <Notice message={t("loadFailed")} />;
	}

	return (
		<div className="wv-card wv-adyen space-y-4 rounded-xl border border-border bg-card p-4 md:p-5">
			{mountState === "mounting" ? (
				<div className="flex items-center gap-3 text-sm text-muted-foreground">
					<LoadingSpinner />
					{t("loading")}
				</div>
			) : null}
			{notice ? (
				<p className="text-sm text-muted-foreground" role="status">
					{notice}
				</p>
			) : null}
			<div ref={containerRef} />
		</div>
	);
};
