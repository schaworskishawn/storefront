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
import { parseCryptoInvoice } from "@/checkout/lib/payment/providers/crypto";
import { WVPAY_GATEWAY_ID } from "@/checkout/lib/payment/providers/wvpay";
import { updateCheckoutBilling } from "@/checkout/lib/payment/update-billing";
import { rethrowNextInternalError } from "@/checkout/lib/rethrow-next-internal-error";

export type CryptoPaymentResult =
	/** The browser is on its way to the hosted payment page. */
	| { ok: true; invoiceUrl: string }
	| { ok: false; kind: "error"; message: string }
	| { ok: false; kind: "billing"; errors: Record<string, string>; focusField?: string }
	| { ok: false; kind: "price_change"; notice: CheckoutPriceChangeNotice };

type Params = {
	checkout: CheckoutFragment;
	billing: StripeBillingContext;
	refreshCheckout: (options?: { updateState?: boolean }) => Promise<CheckoutFragment | null>;
	/** Where the provider sends the shopper after paying; the payments app only accepts addresses on this storefront. */
	returnUrl: string;
	/** Leaves the page for the hosted payment page. Injected so tests don't navigate. */
	navigate: (url: string) => void;
	messages: CheckoutPaymentMessages;
	gatewayMessages: CheckoutGatewayMessages;
};

let payInFlight: Promise<CryptoPaymentResult> | null = null;

/** Single-flight: a double click must not create two invoices for one checkout. */
export async function executeCryptoPayment(params: Params): Promise<CryptoPaymentResult> {
	if (payInFlight) {
		return payInFlight;
	}

	const run = runCryptoPayment(params);
	payInFlight = run;

	try {
		return await run;
	} finally {
		if (payInFlight === run) {
			payInFlight = null;
		}
	}
}

/**
 * Hosted crypto checkout: save billing, confirm the total, ask the payments app for an invoice, remember the transaction, and
 * send the shopper to the provider's page. Nothing is charged here — the order is placed later, once the provider confirms the
 * payment to Saleor (see `use-crypto-return-completion`).
 */
async function runCryptoPayment({
	checkout,
	billing,
	refreshCheckout,
	returnUrl,
	navigate,
	messages,
	gatewayMessages,
}: Params): Promise<CryptoPaymentResult> {
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
			action: "CHARGE",
			paymentGateway: { id: WVPAY_GATEWAY_ID, data: { method: "crypto", returnUrl } },
		});
		if (!initResult.ok) {
			return { ok: false, kind: "error", message: initResult.error };
		}

		const transactionError = getTransactionInitializeError(initResult.data, gatewayMessages);
		if (transactionError) {
			return { ok: false, kind: "error", message: transactionError };
		}

		const transactionId = initResult.data.transaction?.id;
		const invoice = parseCryptoInvoice(initResult.data.data);
		if (!transactionId || !invoice) {
			return { ok: false, kind: "error", message: gatewayMessages.paymentInitFailed };
		}

		writePendingPayment("crypto", {
			checkoutId: liveCheckout.id,
			transactionId,
			invoiceUrl: invoice.invoiceUrl,
		});
		navigate(invoice.invoiceUrl);

		return { ok: true, invoiceUrl: invoice.invoiceUrl };
	} catch (error) {
		rethrowNextInternalError(error);
		console.error("Crypto payment failed:", error);
		return { ok: false, kind: "error", message: messages.unexpectedError };
	}
}
