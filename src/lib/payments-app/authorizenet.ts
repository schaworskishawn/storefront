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
	/**
	 * The first payment of a series the shopper agreed to (the deposit of an installment plan). Flags it to the card networks
	 * as such, which is what makes the later merchant-initiated charges on the stored card legitimate.
	 */
	firstRecurringPayment?: boolean;
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
				processingOptions: input.firstRecurringPayment ? { isFirstRecurringPayment: true } : undefined,
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

/** A stored card: Authorize.net's customer profile and the payment profile (the card) inside it. */
export type StoredCard = { customerProfileId: string; paymentProfileId: string };

export type StoredCardOutcome =
	| { ok: true; card: StoredCard }
	| { ok: false; code: string | null; message: string };

/** Body for `createCustomerProfileFromTransactionRequest`: saves the card used by an approved transaction. */
export function buildCreateProfileFromTransactionRequest(
	config: AuthorizeNetConfig,
	input: {
		transactionId: string;
		merchantCustomerId?: string | null;
		description?: string | null;
		email?: string | null;
	},
) {
	const merchantCustomerId = clip(input.merchantCustomerId, 20);
	const description = clip(input.description, 255);
	const email = clip(input.email, 255);
	return {
		createCustomerProfileFromTransactionRequest: {
			merchantAuthentication: auth(config),
			transId: input.transactionId,
			customer:
				merchantCustomerId || description || email ? { merchantCustomerId, description, email } : undefined,
		},
	};
}

type RawProfileResponse = {
	customerProfileId?: string;
	customerPaymentProfileIdList?: string[];
	profile?: { customerProfileId?: string; paymentProfiles?: Array<{ customerPaymentProfileId?: string }> };
	messages?: { resultCode?: string; message?: Array<{ code?: string; text?: string }> };
};

const firstMessage = (json: RawProfileResponse) => json.messages?.message?.[0];

/** Authorize.net's "A duplicate record with ID 123 already exists." — the id is the profile that already holds this card. */
const DUPLICATE_PROFILE_CODE = "E00039";

function duplicateProfileId(json: RawProfileResponse): string | null {
	const message = firstMessage(json);
	if (message?.code !== DUPLICATE_PROFILE_CODE) return null;
	return json.customerProfileId ?? /\b(\d{4,})\b/.exec(message.text ?? "")?.[1] ?? null;
}

/**
 * Saves the card of an approved transaction as a customer profile, so later payments can be charged without the card
 * number. Safe to repeat: when the transaction's card is already saved, Authorize.net reports the existing profile and we
 * look its card up, so a retried webhook never creates a second profile.
 */
export async function createStoredCardFromTransaction(
	config: AuthorizeNetConfig,
	input: Parameters<typeof buildCreateProfileFromTransactionRequest>[1],
	fetchImpl: Fetcher = fetch,
): Promise<StoredCardOutcome> {
	try {
		const json = (await post(
			config,
			buildCreateProfileFromTransactionRequest(config, input),
			fetchImpl,
		)) as RawProfileResponse;

		if (json.messages?.resultCode === "Ok" && json.customerProfileId) {
			const paymentProfileId = json.customerPaymentProfileIdList?.[0];
			if (paymentProfileId) {
				return { ok: true, card: { customerProfileId: json.customerProfileId, paymentProfileId } };
			}
		}

		const existing = duplicateProfileId(json);
		if (existing) return await lookUpStoredCard(config, existing, fetchImpl);

		const message = firstMessage(json);
		return {
			ok: false,
			code: message?.code ?? null,
			message: message?.text ?? "The card could not be saved for later payments.",
		};
	} catch (error) {
		console.error("[authorizenet] saving the card failed", error instanceof Error ? error.message : error);
		return { ok: false, code: null, message: "We couldn't reach the payment processor." };
	}
}

/** The card inside an existing customer profile. */
export async function lookUpStoredCard(
	config: AuthorizeNetConfig,
	customerProfileId: string,
	fetchImpl: Fetcher = fetch,
): Promise<StoredCardOutcome> {
	try {
		const json = (await post(
			config,
			{ getCustomerProfileRequest: { merchantAuthentication: auth(config), customerProfileId } },
			fetchImpl,
		)) as RawProfileResponse;
		const paymentProfileId = json.profile?.paymentProfiles?.[0]?.customerPaymentProfileId;
		if (json.messages?.resultCode === "Ok" && paymentProfileId) {
			return { ok: true, card: { customerProfileId, paymentProfileId } };
		}
		const message = firstMessage(json);
		return {
			ok: false,
			code: message?.code ?? null,
			message: message?.text ?? "The saved card could not be found.",
		};
	} catch (error) {
		console.error("[authorizenet] profile lookup failed", error instanceof Error ? error.message : error);
		return { ok: false, code: null, message: "We couldn't reach the payment processor." };
	}
}

export type ProfileChargeInput = {
	card: StoredCard;
	amount: number;
	currency: string;
	/** Our reference for this one payment, max 20 chars. A repeat of the same payment reuses it, which the duplicate window catches. */
	invoiceNumber: string;
	description?: string;
};

/**
 * Body for a merchant-initiated charge of a stored card (an installment after the deposit). `recurringBilling` and
 * `isSubsequentAuth` tell the card networks this is a payment the shopper agreed to up front. Key order follows the schema.
 */
export function buildProfileChargeRequest(config: AuthorizeNetConfig, input: ProfileChargeInput) {
	return {
		createTransactionRequest: {
			merchantAuthentication: auth(config),
			refId: clip(input.invoiceNumber, 20),
			transactionRequest: {
				transactionType: "authCaptureTransaction",
				amount: money(input.amount),
				currencyCode: input.currency.toUpperCase(),
				profile: {
					customerProfileId: input.card.customerProfileId,
					paymentProfile: { paymentProfileId: input.card.paymentProfileId },
				},
				order: { invoiceNumber: clip(input.invoiceNumber, 20), description: clip(input.description, 255) },
				// The longest window Authorize.net allows (8 hours): an identical payment re-sent after a crash is refused.
				transactionSettings: {
					setting: [
						{ settingName: "recurringBilling", settingValue: "true" },
						{ settingName: "duplicateWindow", settingValue: "28800" },
					],
				},
				processingOptions: { isSubsequentAuth: true },
			},
		},
	};
}

/** Charges a stored card. A network/HTTP failure becomes an "error" outcome, never a throw. */
export async function chargeStoredCard(
	config: AuthorizeNetConfig,
	input: ProfileChargeInput,
	fetchImpl: Fetcher = fetch,
): Promise<TransactionOutcome> {
	try {
		return parseTransactionResponse(await post(config, buildProfileChargeRequest(config, input), fetchImpl));
	} catch (error) {
		console.error("[authorizenet] stored-card charge failed", error instanceof Error ? error.message : error);
		return {
			ok: false,
			reason: "error",
			code: null,
			message: "We couldn't reach the payment processor.",
		};
	}
}

/** Deletes a customer profile (the stored card), once its plan is finished or cancelled. Never throws. */
export async function deleteStoredCard(
	config: AuthorizeNetConfig,
	customerProfileId: string,
	fetchImpl: Fetcher = fetch,
): Promise<{ ok: boolean; message: string }> {
	try {
		const json = (await post(
			config,
			{ deleteCustomerProfileRequest: { merchantAuthentication: auth(config), customerProfileId } },
			fetchImpl,
		)) as RawProfileResponse;
		const message = firstMessage(json);
		// "E00040": already gone, which is what we wanted.
		if (json.messages?.resultCode === "Ok" || message?.code === "E00040")
			return { ok: true, message: "Deleted." };
		return { ok: false, message: message?.text ?? "The saved card could not be deleted." };
	} catch (error) {
		console.error("[authorizenet] profile delete failed", error instanceof Error ? error.message : error);
		return { ok: false, message: "We couldn't reach the payment processor." };
	}
}
