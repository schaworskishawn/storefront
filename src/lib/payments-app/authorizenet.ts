import "server-only";

/**
 * Authorize.net Transaction API client (JSON over HTTPS, no SDK).
 *
 * Card data never touches our servers: the browser sends it straight to Authorize.net with Accept.js, which hands back an
 * opaque one-time token (`opaqueData`). We only ever charge that token. (That keeps us in PCI SAQ A-EP territory; it is not
 * a hosted payment page, so the merchant still owns the checkout page's security.)
 *
 * Configure with (see .env.example):
 *   AUTHORIZENET_API_LOGIN_ID, AUTHORIZENET_TRANSACTION_KEY  server secrets (Account → Settings → API Credentials & Keys)
 *   AUTHORIZENET_CLIENT_KEY                                    public client key for Accept.js (same page)
 *   AUTHORIZENET_ENVIRONMENT      "sandbox" (default) or "production"
 *   AUTHORIZENET_TRANSACTION_TYPE "authCapture" (default: charge now) or "authOnly" (authorise now, capture later)
 *
 * NOTE: the JSON API follows Authorize.net's XML schema, so the ORDER of keys inside each request object matters. Keep the
 * order used in the builders below.
 */

import { acceptJsUrl, type AuthorizeNetEnvironment } from "./constants";

export { acceptJsUrl, type AuthorizeNetEnvironment };

export type AuthorizeNetConfig = {
	apiLoginId: string;
	transactionKey: string;
	clientKey: string;
	environment: AuthorizeNetEnvironment;
	transactionType: "authCaptureTransaction" | "authOnlyTransaction";
};

export type OpaqueData = { dataDescriptor: string; dataValue: string };

export type BillingAddress = {
	firstName?: string | null;
	lastName?: string | null;
	company?: string | null;
	address?: string | null;
	city?: string | null;
	state?: string | null;
	zip?: string | null;
	country?: string | null;
	phoneNumber?: string | null;
};

const ENDPOINTS: Record<AuthorizeNetEnvironment, string> = {
	sandbox: "https://apitest.authorize.net/xml/v1/request.api",
	production: "https://api.authorize.net/xml/v1/request.api",
};

/** Null unless all three credentials are present — callers treat that as "Authorize.net is not set up". */
export function readAuthorizeNetConfig(
	env: Record<string, string | undefined> = process.env,
): AuthorizeNetConfig | null {
	const apiLoginId = env.AUTHORIZENET_API_LOGIN_ID?.trim();
	const transactionKey = env.AUTHORIZENET_TRANSACTION_KEY?.trim();
	const clientKey = env.AUTHORIZENET_CLIENT_KEY?.trim();
	if (!apiLoginId || !transactionKey || !clientKey) return null;

	return {
		apiLoginId,
		transactionKey,
		clientKey,
		environment:
			env.AUTHORIZENET_ENVIRONMENT?.trim().toLowerCase() === "production" ? "production" : "sandbox",
		transactionType:
			env.AUTHORIZENET_TRANSACTION_TYPE?.trim() === "authOnly"
				? "authOnlyTransaction"
				: "authCaptureTransaction",
	};
}

const clip = (value: string | null | undefined, max: number): string | undefined => {
	const trimmed = value?.trim();
	return trimmed ? trimmed.slice(0, max) : undefined;
};

const money = (amount: number): number => Math.round(amount * 100) / 100;

const auth = (config: AuthorizeNetConfig) => ({
	name: config.apiLoginId,
	transactionKey: config.transactionKey,
});

export type ChargeInput = {
	amount: number;
	/** ISO currency code; Authorize.net accounts are USD or CAD. */
	currency: string;
	opaqueData: OpaqueData;
	/** Our order/checkout reference, max 20 chars (becomes the invoice number). */
	invoiceNumber: string;
	description?: string;
	customerEmail?: string | null;
	billTo?: BillingAddress | null;
	shipTo?: BillingAddress | null;
	customerIp?: string | null;
};

function addressBlock(address: BillingAddress | null | undefined) {
	if (!address) return undefined;
	const block = {
		firstName: clip(address.firstName, 50),
		lastName: clip(address.lastName, 50),
		company: clip(address.company, 50),
		address: clip(address.address, 60),
		city: clip(address.city, 40),
		state: clip(address.state, 40),
		zip: clip(address.zip, 20),
		country: clip(address.country, 60),
		phoneNumber: clip(address.phoneNumber, 25),
	};
	return Object.values(block).some(Boolean) ? block : undefined;
}

/** Body for `createTransactionRequest` charging an Accept.js token. Key order follows Authorize.net's schema. */
export function buildChargeRequest(config: AuthorizeNetConfig, input: ChargeInput) {
	const customer = clip(input.customerEmail, 255);
	return {
		createTransactionRequest: {
			merchantAuthentication: auth(config),
			refId: clip(input.invoiceNumber, 20),
			transactionRequest: {
				transactionType: config.transactionType,
				amount: money(input.amount),
				currencyCode: input.currency.toUpperCase(),
				payment: { opaqueData: input.opaqueData },
				order: { invoiceNumber: clip(input.invoiceNumber, 20), description: clip(input.description, 255) },
				customer: customer ? { email: customer } : undefined,
				billTo: addressBlock(input.billTo),
				shipTo: addressBlock(input.shipTo),
				customerIP: clip(input.customerIp, 39),
				// Guards against a double submit charging twice: an identical charge within 2 minutes is rejected.
				transactionSettings: { setting: [{ settingName: "duplicateWindow", settingValue: "120" }] },
			},
		},
	};
}

export type TransactionOutcome =
	| {
			ok: true;
			transactionId: string;
			authCode: string | null;
			accountLast4: string | null;
			accountType: string | null;
			message: string;
	  }
	| {
			ok: false;
			/** "declined" for a bank decline, "held" for a fraud-review hold, "error" for anything else. */
			reason: "declined" | "held" | "error";
			code: string | null;
			message: string;
	  };

type RawResponse = {
	transactionResponse?: {
		responseCode?: string;
		authCode?: string;
		transId?: string;
		accountNumber?: string;
		accountType?: string;
		messages?: Array<{ code?: string; description?: string }>;
		errors?: Array<{ errorCode?: string; errorText?: string }>;
	};
	messages?: { resultCode?: string; message?: Array<{ code?: string; text?: string }> };
};

/** Turns Authorize.net's response into one of three outcomes. Never throws on odd input. */
export function parseTransactionResponse(raw: unknown): TransactionOutcome {
	const json = (raw ?? {}) as RawResponse;
	const tx = json.transactionResponse;
	const topMessage = json.messages?.message?.[0];

	if (tx?.responseCode === "1" && tx.transId && tx.transId !== "0") {
		return {
			ok: true,
			transactionId: tx.transId,
			authCode: tx.authCode ?? null,
			accountLast4: tx.accountNumber ? tx.accountNumber.replace(/\D/g, "").slice(-4) || null : null,
			accountType: tx.accountType ?? null,
			message: tx.messages?.[0]?.description ?? "Approved",
		};
	}

	const error = tx?.errors?.[0];
	const message =
		error?.errorText ??
		tx?.messages?.[0]?.description ??
		topMessage?.text ??
		"The payment could not be processed.";
	const code = error?.errorCode ?? tx?.messages?.[0]?.code ?? topMessage?.code ?? null;

	if (tx?.responseCode === "4") return { ok: false, reason: "held", code, message };
	if (tx?.responseCode === "2") return { ok: false, reason: "declined", code, message };
	return { ok: false, reason: "error", code, message };
}

type Fetcher = typeof fetch;

async function post(config: AuthorizeNetConfig, body: unknown, fetchImpl: Fetcher): Promise<unknown> {
	const res = await fetchImpl(ENDPOINTS[config.environment], {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
	});
	if (!res.ok) throw new Error(`Authorize.net HTTP ${res.status}`);
	// The API prefixes its JSON with a byte-order mark.
	const text = (await res.text()).replace(/^﻿/, "");
	return JSON.parse(text) as unknown;
}

/** Charges (or authorises) the Accept.js token. A network/HTTP failure becomes an "error" outcome, never a throw. */
export async function chargeCard(
	config: AuthorizeNetConfig,
	input: ChargeInput,
	fetchImpl: Fetcher = fetch,
): Promise<TransactionOutcome> {
	try {
		return parseTransactionResponse(await post(config, buildChargeRequest(config, input), fetchImpl));
	} catch (error) {
		console.error("[authorizenet] charge failed", error instanceof Error ? error.message : error);
		return {
			ok: false,
			reason: "error",
			code: null,
			message: "We couldn't reach the payment processor. Please try again.",
		};
	}
}

export type TransactionDetails = {
	status: string;
	accountLast4: string | null;
	settleAmount: number | null;
};

export async function getTransactionDetails(
	config: AuthorizeNetConfig,
	transactionId: string,
	fetchImpl: Fetcher = fetch,
): Promise<TransactionDetails | null> {
	try {
		const json = (await post(
			config,
			{ getTransactionDetailsRequest: { merchantAuthentication: auth(config), transId: transactionId } },
			fetchImpl,
		)) as {
			messages?: { resultCode?: string };
			transaction?: {
				transactionStatus?: string;
				settleAmount?: number;
				authAmount?: number;
				payment?: { creditCard?: { cardNumber?: string } };
			};
		};
		if (json.messages?.resultCode !== "Ok" || !json.transaction?.transactionStatus) return null;
		const card = json.transaction.payment?.creditCard?.cardNumber;
		return {
			status: json.transaction.transactionStatus,
			accountLast4: card ? card.replace(/\D/g, "").slice(-4) || null : null,
			settleAmount: json.transaction.settleAmount ?? json.transaction.authAmount ?? null,
		};
	} catch (error) {
		console.error("[authorizenet] details lookup failed", error instanceof Error ? error.message : error);
		return null;
	}
}

/** Cancels an unsettled transaction (full amount only). */
export async function voidTransaction(
	config: AuthorizeNetConfig,
	transactionId: string,
	fetchImpl: Fetcher = fetch,
): Promise<TransactionOutcome> {
	try {
		return parseTransactionResponse(
			await post(
				config,
				{
					createTransactionRequest: {
						merchantAuthentication: auth(config),
						transactionRequest: { transactionType: "voidTransaction", refTransId: transactionId },
					},
				},
				fetchImpl,
			),
		);
	} catch (error) {
		console.error("[authorizenet] void failed", error instanceof Error ? error.message : error);
		return { ok: false, reason: "error", code: null, message: "We couldn't reach the payment processor." };
	}
}

/** Refunds (part of) a SETTLED transaction. Authorize.net needs the card's last four digits to do so. */
export async function refundTransaction(
	config: AuthorizeNetConfig,
	{ transactionId, amount, accountLast4 }: { transactionId: string; amount: number; accountLast4: string },
	fetchImpl: Fetcher = fetch,
): Promise<TransactionOutcome> {
	try {
		return parseTransactionResponse(
			await post(
				config,
				{
					createTransactionRequest: {
						merchantAuthentication: auth(config),
						transactionRequest: {
							transactionType: "refundTransaction",
							amount: money(amount),
							payment: { creditCard: { cardNumber: accountLast4, expirationDate: "XXXX" } },
							refTransId: transactionId,
						},
					},
				},
				fetchImpl,
			),
		);
	} catch (error) {
		console.error("[authorizenet] refund failed", error instanceof Error ? error.message : error);
		return { ok: false, reason: "error", code: null, message: "We couldn't reach the payment processor." };
	}
}
