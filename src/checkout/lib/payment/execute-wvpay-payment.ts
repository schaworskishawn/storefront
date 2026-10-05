import { type CheckoutFragment } from "@/checkout/graphql";
import { type StripeBillingContext } from "@/checkout/components/payment/stripe/stripe-billing-context";
import { ACCEPT_FIELD_ERRORS, type TokenizeResult } from "@/checkout/components/payment/wvpay/accept-js";
import { type CardErrors } from "@/checkout/components/payment/wvpay/card-validation";
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
	clearPaymentCompleting,
	isCheckoutPaymentFlowStale,
	markPaymentCompleting,
	stashPaymentCompletionError,
} from "@/checkout/lib/payment/checkout-payment-completion";
import { finalizeCheckoutOrder } from "@/checkout/lib/payment/finalize-checkout-order";
import {
	type CheckoutGatewayMessages,
	getTransactionInitializeError,
} from "@/checkout/lib/payment/gateway-messages";
import { WVPAY_GATEWAY_ID } from "@/checkout/lib/payment/providers/wvpay";
import { updateCheckoutBilling } from "@/checkout/lib/payment/update-billing";
import { rethrowNextInternalError } from "@/checkout/lib/rethrow-next-internal-error";

export type WvPayResult =
	| { ok: true }
	| { ok: false; kind: "error"; message: string }
	| { ok: false; kind: "billing"; errors: Record<string, string>; focusField?: string }
	| { ok: false; kind: "price_change"; notice: CheckoutPriceChangeNotice }
	/** The card was rejected before any charge (bad number/expiry/code) — nothing to reconcile. */
	| { ok: false; kind: "card"; field: keyof CardErrors | null; message: string };

type Params = {
	checkout: CheckoutFragment;
	billing: StripeBillingContext;
	refreshCheckout: (options?: { updateState?: boolean }) => Promise<CheckoutFragment | null>;
	/** Exchanges the entered card for a one-time Accept.js token. Runs only after totals are confirmed. */
	tokenize: () => Promise<TokenizeResult>;
	messages: CheckoutPaymentMessages;
	gatewayMessages: CheckoutGatewayMessages;
};

let payInFlight: Promise<WvPayResult> | null = null;

/**
 * Single-flight wrapper: a double click must not charge a card twice (the processor also rejects an identical charge inside
 * a two-minute window, but we never want to get that far).
 */
export async function executeWvPayPayment(params: Params): Promise<WvPayResult> {
	if (payInFlight) {
		return payInFlight;
	}

	const run = runWvPayPayment(params);
	payInFlight = run;

	try {
		return await run;
	} finally {
		if (payInFlight === run) {
			payInFlight = null;
		}
	}
}

async function runWvPayPayment({
	checkout,
	billing,
	refreshCheckout,
	tokenize,
	messages,
	gatewayMessages,
}: Params): Promise<WvPayResult> {
	const flowGeneration = beginCheckoutPaymentFlow();
	let charged = false;

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

		if (displayedAmount !== null && hasMaterialCheckoutTotalChange(displayedAmount, payAmount)) {
			return {
				ok: false,
				kind: "price_change",
				notice: buildCheckoutPriceChangeNotice(displayedAmount, payAmount, currency),
			};
		}

		const token = await tokenize();
		if (!token.ok) {
			const field = (token.code && ACCEPT_FIELD_ERRORS[token.code]) || null;
			return { ok: false, kind: "card", field, message: token.message };
		}

		// Browser Back / navigation bumps the flow generation — stop before money can move.
		if (isCheckoutPaymentFlowStale(flowGeneration)) {
			return { ok: false, kind: "error", message: messages.interruptedBeforeCharge };
		}

		const initResult = await getCheckoutTransport().initializeTransaction({
			checkoutId: liveCheckout.id,
			amount: payAmount,
			paymentGateway: {
				id: WVPAY_GATEWAY_ID,
				data: { method: "authorizenet", opaqueData: token.opaqueData },
			},
		});
		if (!initResult.ok) {
			return { ok: false, kind: "error", message: initResult.error };
		}

		const transactionError = getTransactionInitializeError(initResult.data, gatewayMessages);
		if (transactionError) {
			return { ok: false, kind: "error", message: transactionError };
		}

		// The card has been charged. From here on a failure must never read as "try again".
		charged = true;
		markPaymentCompleting(liveCheckout.id);

		const completeResult = await finalizeCheckoutOrder(liveCheckout.id, liveCheckout.channel.slug);
		if (!completeResult.ok) {
			stashPaymentCompletionError(completeResult.error);
			try {
				await refreshCheckout();
			} catch (error) {
				rethrowNextInternalError(error);
			}
			clearPaymentCompleting();
			return { ok: false, kind: "error", message: completeResult.error };
		}

		return { ok: true };
	} catch (error) {
		rethrowNextInternalError(error);
		console.error("Card payment failed:", error);
		const message = charged ? messages.interruptedAfterAuthorize : messages.unexpectedError;
		if (charged) {
			stashPaymentCompletionError(message);
		}
		clearPaymentCompleting();
		return { ok: false, kind: "error", message };
	}
}
