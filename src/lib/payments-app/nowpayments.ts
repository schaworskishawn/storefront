import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * NOWPayments client for hosted crypto checkout (https://documentation.nowpayments.io).
 *
 * The shopper never enters anything on our site: we create an *invoice* and send them to NOWPayments' hosted page, where they
 * pick a coin and pay. NOWPayments then calls our IPN endpoint (signed with HMAC-SHA512) when the payment moves — that, not the
 * shopper's browser, is what tells Saleor the money arrived.
 *
 * Configure with (see .env.example):
 *   NOWPAYMENTS_API_KEY      server secret (Store Settings → API keys)
 *   NOWPAYMENTS_IPN_SECRET   server secret used to verify IPN callbacks (Store Settings → Instant payment notifications)
 *   NOWPAYMENTS_SANDBOX      "true" to use the sandbox API with sandbox keys
 */

export type NowPaymentsConfig = {
	apiKey: string;
	ipnSecret: string;
	sandbox: boolean;
};

/** Null unless both secrets are present — callers treat that as "crypto is not set up". */
export function readNowPaymentsConfig(
	env: Record<string, string | undefined> = process.env,
): NowPaymentsConfig | null {
	const apiKey = env.NOWPAYMENTS_API_KEY?.trim();
	const ipnSecret = env.NOWPAYMENTS_IPN_SECRET?.trim();
	if (!apiKey || !ipnSecret) return null;
	return { apiKey, ipnSecret, sandbox: env.NOWPAYMENTS_SANDBOX?.trim().toLowerCase() === "true" };
}

const API_URLS = {
	live: "https://api.nowpayments.io/v1",
	sandbox: "https://api-sandbox.nowpayments.io/v1",
} as const;

export type CreateInvoiceInput = {
	/** Fiat amount in `currency`. NOWPayments converts it to the coin the shopper picks. */
	amount: number;
	currency: string;
	/** Echoed back in every IPN so we can find the Saleor transaction. */
	orderId: string;
	description: string;
	ipnUrl: string;
	successUrl: string;
	cancelUrl: string;
};

export type InvoiceOutcome =
	| { ok: true; invoiceId: string; invoiceUrl: string }
	| { ok: false; message: string; status?: number };

export async function createInvoice(
	config: NowPaymentsConfig,
	input: CreateInvoiceInput,
	fetchImpl: typeof fetch = fetch,
): Promise<InvoiceOutcome> {
	let response: Response;
	try {
		response = await fetchImpl(`${API_URLS[config.sandbox ? "sandbox" : "live"]}/invoice`, {
			method: "POST",
			headers: { "Content-Type": "application/json", "x-api-key": config.apiKey },
			body: JSON.stringify({
				price_amount: Math.round(input.amount * 100) / 100,
				price_currency: input.currency.toLowerCase(),
				order_id: input.orderId,
				order_description: input.description,
				ipn_callback_url: input.ipnUrl,
				success_url: input.successUrl,
				cancel_url: input.cancelUrl,
			}),
			cache: "no-store",
		});
	} catch {
		return { ok: false, message: "Couldn't reach the crypto payment provider." };
	}

	const body = (await response.json().catch(() => null)) as {
		id?: string | number;
		invoice_url?: string;
		message?: string;
	} | null;

	if (!response.ok || !body?.invoice_url || body.id === undefined) {
		return {
			ok: false,
			status: response.status,
			message: body?.message
				? `Crypto payment provider: ${body.message}`
				: "Couldn't create the crypto invoice.",
		};
	}

	return { ok: true, invoiceId: String(body.id), invoiceUrl: body.invoice_url };
}

/** NOWPayments signs the JSON body with its keys sorted at every level, so we re-serialize the same way before hashing. */
function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value as Record<string, unknown>)
				.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
				.map(([key, inner]) => [key, sortKeys(inner)]),
		);
	}
	return value;
}

export function computeIpnSignature(body: unknown, secret: string): string {
	return createHmac("sha512", secret)
		.update(JSON.stringify(sortKeys(body)))
		.digest("hex");
}

/** Constant-time check of the `x-nowpayments-sig` header. */
export function verifyIpnSignature(body: unknown, signature: string | null, secret: string): boolean {
	if (!signature) return false;
	const expected = Buffer.from(computeIpnSignature(body, secret), "utf8");
	const received = Buffer.from(signature.trim().toLowerCase(), "utf8");
	return expected.length === received.length && timingSafeEqual(expected, received);
}

export type IpnPayment = {
	paymentId: string;
	status: string;
	orderId: string;
	priceAmount: number;
	priceCurrency: string;
};

/** Pulls out the IPN fields we act on; null when the callback isn't shaped like a payment update. */
export function parseIpnPayment(body: unknown): IpnPayment | null {
	if (!body || typeof body !== "object") return null;
	const record = body as Record<string, unknown>;
	const paymentId = record.payment_id;
	const orderId = record.order_id;
	const priceAmount = Number(record.price_amount);
	if (
		(typeof paymentId !== "string" && typeof paymentId !== "number") ||
		typeof record.payment_status !== "string" ||
		typeof orderId !== "string" ||
		!orderId ||
		!Number.isFinite(priceAmount) ||
		typeof record.price_currency !== "string"
	) {
		return null;
	}
	return {
		paymentId: String(paymentId),
		status: record.payment_status,
		orderId,
		priceAmount,
		priceCurrency: record.price_currency.toUpperCase(),
	};
}

export type IpnOutcome = "paid" | "failed" | "ignore";

/**
 * `finished` is the only status that means the shopper's money reached the merchant. `partially_paid` is deliberately *not* a
 * success (the shopper underpaid — support has to decide), and the in-between statuses change nothing yet.
 */
export function classifyIpnStatus(status: string): IpnOutcome {
	switch (status) {
		case "finished":
			return "paid";
		case "failed":
		case "expired":
			return "failed";
		default:
			return "ignore";
	}
}
