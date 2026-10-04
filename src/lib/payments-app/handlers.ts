import "server-only";

import {
	acceptJsUrl,
	chargeCard,
	getTransactionDetails,
	readAuthorizeNetConfig,
	refundTransaction,
	voidTransaction,
	type AuthorizeNetConfig,
	type BillingAddress,
	type OpaqueData,
} from "./authorizenet";

/**
 * The synchronous Saleor webhooks of the payments app. Each handler takes the already-verified, parsed payload and returns
 * the JSON body Saleor expects. They never throw: a processing problem becomes a *_FAILURE result so Saleor and the shopper
 * get a clear answer instead of a 500.
 *
 * Saleor is the source of truth for the amount and currency (`action.amount`/`action.currency`) — whatever the browser
 * sent is ignored.
 */

type SaleorAddress = {
	firstName?: string | null;
	lastName?: string | null;
	companyName?: string | null;
	streetAddress1?: string | null;
	streetAddress2?: string | null;
	city?: string | null;
	countryArea?: string | null;
	postalCode?: string | null;
	phone?: string | null;
	country?: { code?: string | null } | null;
};

export type TransactionInitializePayload = {
	action?: { amount?: number; currency?: string; actionType?: string };
	data?: unknown;
	merchantReference?: string | null;
	customerIpAddress?: string | null;
	transaction?: { id?: string; pspReference?: string | null };
	sourceObject?: {
		__typename?: string;
		id?: string;
		email?: string | null;
		userEmail?: string | null;
		number?: string | null;
		billingAddress?: SaleorAddress | null;
		shippingAddress?: SaleorAddress | null;
	};
};

export type TransactionActionPayload = {
	action?: { amount?: number; currency?: string };
	transaction?: { id?: string; pspReference?: string | null };
};

type Deps = {
	config: AuthorizeNetConfig | null;
	authorizenet: {
		chargeCard: typeof chargeCard;
		getTransactionDetails: typeof getTransactionDetails;
		voidTransaction: typeof voidTransaction;
		refundTransaction: typeof refundTransaction;
	};
};

export function defaultDeps(): Deps {
	return {
		config: readAuthorizeNetConfig(),
		authorizenet: { chargeCard, getTransactionDetails, voidTransaction, refundTransaction },
	};
}

/** Currencies an Authorize.net merchant account can settle. */
const SUPPORTED_CURRENCIES = new Set(["USD", "CAD"]);

function toBilling(address: SaleorAddress | null | undefined): BillingAddress | null {
	if (!address) return null;
	return {
		firstName: address.firstName,
		lastName: address.lastName,
		company: address.companyName,
		address: [address.streetAddress1, address.streetAddress2].filter(Boolean).join(", "),
		city: address.city,
		state: address.countryArea,
		zip: address.postalCode,
		country: address.country?.code,
		phoneNumber: address.phone,
	};
}

function parseOpaqueData(data: unknown): OpaqueData | null {
	const opaque = (data as { opaqueData?: Partial<OpaqueData> } | null)?.opaqueData;
	if (!opaque || typeof opaque.dataDescriptor !== "string" || typeof opaque.dataValue !== "string")
		return null;
	if (!opaque.dataDescriptor || !opaque.dataValue) return null;
	return { dataDescriptor: opaque.dataDescriptor, dataValue: opaque.dataValue };
}

/** Browser-safe settings for the card form. The transaction key never leaves the server. */
export function handleGatewayInitialize(deps: Deps = defaultDeps()) {
	const { config } = deps;
	if (!config) {
		return { data: { methods: [] as string[] } };
	}
	return {
		data: {
			methods: ["authorizenet"],
			authorizenet: {
				environment: config.environment,
				apiLoginId: config.apiLoginId,
				clientKey: config.clientKey,
				scriptUrl: acceptJsUrl(config.environment),
			},
		},
	};
}

export async function handleTransactionInitialize(
	payload: TransactionInitializePayload,
	deps: Deps = defaultDeps(),
) {
	const amount = payload.action?.amount;
	const currency = payload.action?.currency?.toUpperCase();
	const failure = (message: string, reason: string) => ({
		result: "CHARGE_FAILURE" as const,
		amount: typeof amount === "number" ? amount : 0,
		message,
		data: { reason },
	});

	if (!deps.config) return failure("Card payments aren't set up yet.", "not_configured");
	if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || !currency) {
		return failure("The order amount is invalid.", "invalid_amount");
	}
	if (!SUPPORTED_CURRENCIES.has(currency)) {
		return failure(`Card payments aren't available in ${currency}.`, "unsupported_currency");
	}

	const method = (payload.data as { method?: string } | null)?.method;
	if (method && method !== "authorizenet") return failure("Unknown payment method.", "unknown_method");

	const opaqueData = parseOpaqueData(payload.data);
	if (!opaqueData)
		return failure("The card details were missing. Please re-enter your card.", "missing_card_token");

	const source = payload.sourceObject;
	const outcome = await deps.authorizenet.chargeCard(deps.config, {
		amount,
		currency,
		opaqueData,
		invoiceNumber:
			source?.number || payload.merchantReference || `WV-${Date.now().toString(36)}`.toUpperCase(),
		description: "Worldwide Vapor order",
		customerEmail: source?.email ?? source?.userEmail ?? null,
		billTo: toBilling(source?.billingAddress),
		shipTo: toBilling(source?.shippingAddress),
		customerIp: payload.customerIpAddress ?? null,
	});

	if (!outcome.ok) {
		const message =
			outcome.reason === "held" ? "Your payment is being reviewed. Please contact support." : outcome.message;
		return { ...failure(message, outcome.reason), data: { reason: outcome.reason, code: outcome.code } };
	}

	const authorizeOnly = deps.config.transactionType === "authOnlyTransaction";
	return {
		result: authorizeOnly ? ("AUTHORIZATION_SUCCESS" as const) : ("CHARGE_SUCCESS" as const),
		pspReference: outcome.transactionId,
		amount,
		message: outcome.message,
		data: {
			brand: outcome.accountType,
			last4: outcome.accountLast4,
			authCode: outcome.authCode,
		},
	};
}

/** TRANSACTION_REFUND_REQUESTED: void while unsettled (full amount), real refund once settled. */
export async function handleTransactionRefund(payload: TransactionActionPayload, deps: Deps = defaultDeps()) {
	const amount = payload.action?.amount ?? 0;
	const pspReference = payload.transaction?.pspReference ?? undefined;
	const failure = (message: string) => ({ result: "REFUND_FAILURE" as const, amount, pspReference, message });

	if (!deps.config) return failure("Card payments aren't set up.");
	if (!pspReference) return failure("This payment has no Authorize.net transaction to refund.");
	if (!(amount > 0)) return failure("The refund amount is invalid.");

	const details = await deps.authorizenet.getTransactionDetails(deps.config, pspReference);
	if (!details) return failure("Couldn't look up the original payment at Authorize.net.");

	if (details.status === "capturedPendingSettlement" || details.status === "authorizedPendingCapture") {
		// Not settled yet, so it can only be cancelled in full.
		if (details.settleAmount !== null && Math.abs(details.settleAmount - amount) > 0.005) {
			return failure(
				"A partial refund is only possible after the payment settles (usually the next business day).",
			);
		}
		const voided = await deps.authorizenet.voidTransaction(deps.config, pspReference);
		return voided.ok
			? {
					result: "REFUND_SUCCESS" as const,
					amount,
					pspReference: voided.transactionId,
					message: "Payment voided before settlement.",
				}
			: failure(voided.message);
	}

	if (details.status === "settledSuccessfully") {
		if (!details.accountLast4) return failure("Authorize.net didn't return the card's last four digits.");
		const refund = await deps.authorizenet.refundTransaction(deps.config, {
			transactionId: pspReference,
			amount,
			accountLast4: details.accountLast4,
		});
		return refund.ok
			? {
					result: "REFUND_SUCCESS" as const,
					amount,
					pspReference: refund.transactionId,
					message: "Refunded.",
				}
			: failure(refund.message);
	}

	return failure(`This payment can't be refunded (status: ${details.status}).`);
}

/** TRANSACTION_CANCELATION_REQUESTED: void an authorisation that was never captured. */
export async function handleTransactionCancel(payload: TransactionActionPayload, deps: Deps = defaultDeps()) {
	const amount = payload.action?.amount ?? 0;
	const pspReference = payload.transaction?.pspReference ?? undefined;
	const failure = (message: string) => ({ result: "CANCEL_FAILURE" as const, amount, pspReference, message });

	if (!deps.config) return failure("Card payments aren't set up.");
	if (!pspReference) return failure("This payment has no Authorize.net transaction to cancel.");

	const voided = await deps.authorizenet.voidTransaction(deps.config, pspReference);
	return voided.ok
		? {
				result: "CANCEL_SUCCESS" as const,
				amount,
				pspReference: voided.transactionId,
				message: "Authorization cancelled.",
			}
		: failure(voided.message);
}
