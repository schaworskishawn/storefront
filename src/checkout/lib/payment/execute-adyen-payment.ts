import { type CheckoutFragment } from "@/checkout/graphql";
import { type StripeBillingContext } from "@/checkout/components/payment/stripe/stripe-billing-context";
import { type CheckoutPaymentMessages } from "@/checkout/hooks/use-checkout-payment-messages";
import { getCheckoutTransport } from "@/checkout/lib/checkout-transport";
import {
	buildCheckoutPriceChangeNotice,
	getCheckoutPayAmount,
	getCheckoutPayCurrency,
	hasMaterialCheckoutTotalChange,
	type CheckoutPriceChangeNotice,
} from "@/checkout/lib/payment/checkout-pay-amount";
import {
	beginCheckoutPaymentFlow,
	isCheckoutPaymentFlowStale,
} from "@/checkout/lib/payment/checkout-payment-completion";
import {
	type CheckoutGatewayMessages,
	getTransactionInitializeError,
} from "@/checkout/lib/payment/gateway-messages";
import { writePendingPayment } from "@/checkout/lib/payment/pending-payment-storage";
import {
	ADYEN_GATEWAY_ID,
	parseAdyenDetailsResponse,
	parseAdyenPaymentResponse,
	type AdyenResponse,
} from "@/checkout/lib/payment/providers/adyen";
import { updateCheckoutBilling } from "@/checkout/lib/payment/update-billing";
import { rethrowNextInternalError } from "@/checkout/lib/rethrow-next-internal-error";

/**
 * Adyen Drop-in (PayPal, buy-now-pay-later) pipeline. Drop-in owns the Pay button and the browser-side steps (PayPal pop-up,
 * lender redirect, 3-D Secure); this file does the Saleor side of each callback:
 *
 *   onSubmit            → submitAdyenPayment  → billing → totals check → transactionInitialize
 *   onAdditionalDetails → submitAdyenDetails  → transactionProcess
 *   onPaymentCompleted  → (component) finalizeCheckoutOrder
 */

export type AdyenSubmitResult =
	| { ok: true; response: AdyenResponse; transactionId: string }
	| { ok: false; kind: "error"; message: string }
	| { ok: false; kind: "billing"; errors: Record<string, string>; focusField?: string }
	| { ok: false; kind: "price_change"; notice: CheckoutPriceChangeNotice };

export type AdyenDetailsResult = { ok: true; response: AdyenResponse } | { ok: false; message: string };

/** The parts of the Drop-in's `state.data` the Saleor Adyen app accepts; everything else is left behind. */
const DROPIN_DATA_KEYS = ["paymentMethod", "browserInfo", "order"] as const;

export function pickAdyenPaymentData(stateData: Record<string, unknown>): Record<string, unknown> {
	const picked: Record<string, unknown> = {};
	for (const key of DROPIN_DATA_KEYS) {
		if (stateData[key] !== undefined) {
			picked[key] = stateData[key];
		}
	}
	return picked;
}

type SubmitParams = {
	checkout: CheckoutFragment;
	billing: StripeBillingContext;
	refreshCheckout: (options?: { updateState?: boolean }) => Promise<CheckoutFragment | null>;
	/** `state.data` from Drop-in's `onSubmit`. */
	stateData: Record<string, unknown>;
	/** Where Adyen sends the shopper back after a redirect (lender site, 3-D Secure). */
	returnUrl: string;
	origin: string;
	messages: CheckoutPaymentMessages;
	gatewayMessages: CheckoutGatewayMessages;
};

let submitInFlight: Promise<AdyenSubmitResult> | null = null;

/** Single-flight: a double click on Drop-in's Pay button must not create two transactions. */
export async function submitAdyenPayment(params: SubmitParams): Promise<AdyenSubmitResult> {
	if (submitInFlight) {
		return submitInFlight;
	}

	const run = runSubmitAdyenPayment(params);
	submitInFlight = run;

	try {
		return await run;
	} finally {
		if (submitInFlight === run) {
			submitInFlight = null;
		}
	}
}

async function runSubmitAdyenPayment({
	checkout,
	billing,
	refreshCheckout,
	stateData,
	returnUrl,
	origin,
	messages,
	gatewayMessages,
}: SubmitParams): Promise<AdyenSubmitResult> {
	const flowGeneration = beginCheckoutPaymentFlow();

	try {
		const billingResult = await updateCheckoutBilling({
			checkoutId: checkout.id,
			sameAsBilling: billing.sameAsBilling,
			hasShippingAddress: billing.hasShippingAddress,
			billingData: billing.billingData,
			shippingAddress: billing.shippingAddress,
			userAddresses: billing.userAddresses,
			authenticated: billing.authenticated,
		});
		if (!billingResult.ok) {
			return {
				ok: false,
				kind: "billing",
				errors: billingResult.errors,
				focusField: billingResult.focusField,
			};
		}

		const liveCheckout = await refreshCheckout({ updateState: false });
		if (!liveCheckout) {
			return { ok: false, kind: "error", message: messages.totalsRefreshFailed };
		}

		const displayedAmount = getCheckoutPayAmount(checkout);
		const payAmount = getCheckoutPayAmount(liveCheckout);
		if (payAmount === null) {
			return { ok: false, kind: "error", message: messages.totalUnavailable };
		}

		const currency = getCheckoutPayCurrency(liveCheckout);
		if (!currency) {
			return { ok: false, kind: "error", message: messages.currencyUnavailable };
		}

		// The Drop-in was set up for the displayed total; if it moved, the shopper must see the new price before paying.
		if (displayedAmount !== null && hasMaterialCheckoutTotalChange(displayedAmount, payAmount)) {
			return {
				ok: false,
				kind: "price_change",
				notice: buildCheckoutPriceChangeNotice(displayedAmount, payAmount, currency),
			};
		}

		if (isCheckoutPaymentFlowStale(flowGeneration)) {
			return { ok: false, kind: "error", message: messages.interruptedBeforeCharge };
		}

		const initResult = await getCheckoutTransport().initializeTransaction({
			checkoutId: liveCheckout.id,
			amount: payAmount,
			paymentGateway: {
				id: ADYEN_GATEWAY_ID,
				data: { ...pickAdyenPaymentData(stateData), returnUrl, origin, channel: "Web" },
			},
		});
		if (!initResult.ok) {
			return { ok: false, kind: "error", message: initResult.error };
		}

		const transactionError = getTransactionInitializeError(initResult.data, gatewayMessages);
		if (transactionError) {
			return { ok: false, kind: "error", message: transactionError };
		}

		const transactionId = initResult.data.transaction?.id;
		const response = parseAdyenPaymentResponse(initResult.data.data);
		if (!transactionId || !response) {
			return { ok: false, kind: "error", message: gatewayMessages.paymentInitFailed };
		}

		// A redirect leaves this page, so what we need to finish the payment on return is written before Drop-in acts.
		const paymentData =
			typeof response.action?.paymentData === "string" ? response.action.paymentData : undefined;
		writePendingPayment("adyen", { checkoutId: liveCheckout.id, transactionId, paymentData });

		return { ok: true, response, transactionId };
	} catch (error) {
		rethrowNextInternalError(error);
		console.error("Adyen payment failed:", error);
		return { ok: false, kind: "error", message: messages.unexpectedError };
	}
}

type DetailsParams = {
	transactionId: string;
	/** `state.data` from Drop-in's `onAdditionalDetails`, or the redirect result rebuilt from the return URL. */
	data: Record<string, unknown>;
	messages: CheckoutPaymentMessages;
	gatewayMessages: CheckoutGatewayMessages;
};

/** Sends 3-D Secure / redirect results back to Adyen (through Saleor) and reads the verdict. */
export async function submitAdyenDetails({
	transactionId,
	data,
	messages,
	gatewayMessages,
}: DetailsParams): Promise<AdyenDetailsResult> {
	try {
		const result = await getCheckoutTransport().processTransaction({ id: transactionId, data });
		if (!result.ok) {
			return { ok: false, message: result.error };
		}

		const failure = getTransactionInitializeError(result.data, gatewayMessages);
		if (failure) {
			return { ok: false, message: failure };
		}

		const response = parseAdyenDetailsResponse(result.data.data);
		if (!response) {
			return { ok: false, message: gatewayMessages.paymentFailed };
		}

		return { ok: true, response };
	} catch (error) {
		rethrowNextInternalError(error);
		console.error("Adyen payment details failed:", error);
		return { ok: false, message: messages.unexpectedError };
	}
}
