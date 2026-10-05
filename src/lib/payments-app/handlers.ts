import "server-only";

import { CRYPTO_PSP_PREFIX } from "./constants";
import { createInvoice, readNowPaymentsConfig, type NowPaymentsConfig } from "./nowpayments";

/**
 * The synchronous Saleor webhooks of the payments app. Each handler takes the already-verified, parsed payload and returns
 * the JSON body Saleor expects. They never throw: a processing problem becomes a *_FAILURE result so Saleor and the shopper
 * get a clear answer instead of a 500.
 *
 * Saleor is the source of truth for the amount and currency (`action.amount`/`action.currency`) — whatever the browser
 * sent is ignored.
 */

export type TransactionInitializePayload = {
	action?: { amount?: number; currency?: string; actionType?: string };
	data?: unknown;
	merchantReference?: string | null;
	transaction?: { id?: string; pspReference?: string | null };
};

export type TransactionActionPayload = {
	action?: { amount?: number; currency?: string };
	transaction?: { id?: string; pspReference?: string | null };
};

type Deps = {
	/** Hosted crypto checkout. */
	crypto: {
		config: NowPaymentsConfig | null;
		createInvoice: typeof createInvoice;
		/** Public origin of this storefront — where the crypto provider sends the shopper back and calls our IPN. */
		storefrontOrigin: string;
	};
};

export function defaultDeps(): Deps {
	return {
		crypto: {
			config: readNowPaymentsConfig(),
			createInvoice,
			storefrontOrigin: (process.env.NEXT_PUBLIC_STOREFRONT_URL || "http://localhost:3000").replace(
				/\/+$/,
				"",
			),
		},
	};
}

/** Which payment methods this app offers right now. Nothing secret: the provider's keys never leave the server. */
export function handleGatewayInitialize(deps: Deps = defaultDeps()) {
	const methods: string[] = [];
	const data: Record<string, unknown> = { methods };

	if (deps.crypto.config) {
		methods.push("crypto");
		data.crypto = { provider: "nowpayments" };
	}

	return { data };
}

/** Where the crypto provider may send the shopper back to: a page on this storefront, nowhere else. */
function sameOriginUrl(value: unknown, origin: string): URL | null {
	if (typeof value !== "string") return null;
	try {
		const url = new URL(value);
		return url.origin === new URL(origin).origin ? url : null;
	} catch {
		return null;
	}
}

/**
 * Crypto: create a hosted invoice and hand its URL back. Nothing is charged here — the payment finishes later, when the
 * provider calls the IPN route, so the result is "action required" and Saleor keeps the checkout unpaid until then.
 */
async function handleCryptoInitialize(payload: TransactionInitializePayload, crypto: Deps["crypto"]) {
	const amount = payload.action?.amount;
	const currency = payload.action?.currency?.toUpperCase();
	const failure = (message: string, reason: string) => ({
		result: "CHARGE_FAILURE" as const,
		amount: typeof amount === "number" ? amount : 0,
		message,
		data: { reason },
	});

	if (!crypto.config) return failure("Crypto payments aren't set up yet.", "not_configured");
	if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || !currency) {
		return failure("The order amount is invalid.", "invalid_amount");
	}

	const transactionId = payload.transaction?.id;
	if (!transactionId)
		return failure("Saleor didn't send a transaction to attach the payment to.", "missing_transaction");

	const returnUrl = sameOriginUrl(
		(payload.data as { returnUrl?: unknown } | null)?.returnUrl,
		crypto.storefrontOrigin,
	);
	if (!returnUrl)
		return failure("The return address for the crypto payment is not valid.", "invalid_return_url");

	const cancelUrl = new URL(returnUrl);
	cancelUrl.searchParams.delete("processingPayment");

	const invoice = await crypto.createInvoice(crypto.config, {
		amount,
		currency,
		orderId: transactionId,
		description: "Worldwide Vapor order",
		ipnUrl: `${crypto.storefrontOrigin}/api/saleor-app/crypto/ipn`,
		successUrl: returnUrl.toString(),
		cancelUrl: cancelUrl.toString(),
	});
	if (!invoice.ok) return failure(invoice.message, "invoice_failed");

	return {
		result: "CHARGE_ACTION_REQUIRED" as const,
		pspReference: `${CRYPTO_PSP_PREFIX}${invoice.invoiceId}`,
		amount,
		message: "Waiting for the crypto payment.",
		data: { method: "crypto", invoiceId: invoice.invoiceId, invoiceUrl: invoice.invoiceUrl },
	};
}

export async function handleTransactionInitialize(
	payload: TransactionInitializePayload,
	deps: Deps = defaultDeps(),
) {
	const method = (payload.data as { method?: string } | null)?.method;
	if (method === "crypto") {
		return handleCryptoInitialize(payload, deps.crypto);
	}

	const amount = payload.action?.amount;
	return {
		result: "CHARGE_FAILURE" as const,
		amount: typeof amount === "number" ? amount : 0,
		message: "Unknown payment method.",
		data: { reason: "unknown_method" },
	};
}

/** TRANSACTION_REFUND_REQUESTED: crypto can't be refunded from here, and this app handles nothing else. */
export async function handleTransactionRefund(payload: TransactionActionPayload) {
	const amount = payload.action?.amount ?? 0;
	const pspReference = payload.transaction?.pspReference ?? undefined;
	const failure = (message: string) => ({ result: "REFUND_FAILURE" as const, amount, pspReference, message });

	if (pspReference?.startsWith(CRYPTO_PSP_PREFIX)) {
		return failure(
			"Crypto payments can't be refunded from here. Send the refund from your crypto provider's dashboard, then record it in Saleor.",
		);
	}
	return failure("This payment wasn't made through this app, so it can't be refunded here.");
}

/** TRANSACTION_CANCELATION_REQUESTED: nothing to cancel — an unpaid crypto invoice simply expires. */
export async function handleTransactionCancel(payload: TransactionActionPayload) {
	const amount = payload.action?.amount ?? 0;
	const pspReference = payload.transaction?.pspReference ?? undefined;
	const failure = (message: string) => ({ result: "CANCEL_FAILURE" as const, amount, pspReference, message });

	if (pspReference?.startsWith(CRYPTO_PSP_PREFIX)) {
		return failure("Crypto payments can't be cancelled from here; an unpaid crypto invoice simply expires.");
	}
	return failure("This payment wasn't made through this app, so it can't be cancelled here.");
}
