import { createHmac } from "node:crypto";
import { NOWPAYMENTS_API_URLS } from "@/lib/payments-app/nowpayments";
import type { Result } from "./engine";
import type { CryptoCoin } from "./records";

/**
 * Crypto payouts through the store's NOWPayments account (its "mass payouts" API). From NOWPayments' API reference:
 *
 * - `POST /v1/auth {email, password}` gives a JWT that lasts 5 minutes; creating and verifying payouts need it as
 *   `Authorization: Bearer`, alongside the account's `x-api-key`.
 * - `POST /v1/payout {withdrawals: [...]}` creates a batch; nothing is sent until `POST /v1/payout/:batch/verify` with the
 *   account's 2FA code (one code for the whole batch; 10 tries; an unverified batch is rejected after an hour).
 * - `GET /v1/payout/:id` reports `creating`, `waiting`, `processing`, `sending`, `finished`, `failed` or `rejected`.
 * - Payouts are refused unless they come from a whitelisted IP address and go to a whitelisted wallet (both on by default).
 *
 * Configuration: NOWPAYMENTS_API_KEY (already set for crypto checkout), NOWPAYMENTS_PAYOUT_EMAIL and
 * NOWPAYMENTS_PAYOUT_PASSWORD (the dashboard login), and, only for fully automatic payouts, NOWPAYMENTS_2FA_SECRET (the
 * authenticator secret, from which `totp` makes the code). Nothing here throws.
 */

export type PayoutApiConfig = {
	apiKey: string;
	email: string;
	password: string;
	/** The base32 authenticator secret, when payouts may be verified without the owner. */
	totpSecret: string | null;
	baseUrl: string;
};

export function readPayoutApiConfig(
	env: Record<string, string | undefined> = process.env,
): PayoutApiConfig | null {
	const apiKey = env.NOWPAYMENTS_API_KEY?.trim();
	const email = env.NOWPAYMENTS_PAYOUT_EMAIL?.trim();
	const password = env.NOWPAYMENTS_PAYOUT_PASSWORD;
	if (!apiKey || !email || !password) return null;
	const sandbox = env.NOWPAYMENTS_SANDBOX?.trim().toLowerCase() === "true";
	return {
		apiKey,
		email,
		password,
		totpSecret: env.NOWPAYMENTS_2FA_SECRET?.replace(/\s+/g, "") || null,
		baseUrl: NOWPAYMENTS_API_URLS[sandbox ? "sandbox" : "live"],
	};
}

type Options = { fetchImpl?: typeof fetch };

/** NOWPayments' refusal in plain words: the whitelist ones are what a first setup usually hits. */
export function explainNowPaymentsError(status: number, message: string): string {
	const text = message.toLowerCase();
	if (text.includes("ip") && text.includes("whitelist"))
		return "NOWPayments refused: this server's address isn't whitelisted. Ask NOWPayments to lift the IP whitelist (whitelist@nowpayments.io).";
	if (text.includes("whitelist") || text.includes("address is not"))
		return "NOWPayments refused: the wallet isn't whitelisted. Add it under Settings → Whitelist in NOWPayments.";
	if (status === 401 || status === 403)
		return `NOWPayments refused the request (${status}): ${message || "not allowed"}.`;
	if (text.includes("balance") || text.includes("insufficient"))
		return "NOWPayments refused: the custody balance is too low to cover the payouts.";
	return `NOWPayments answered ${status}${message ? `: ${message}` : ""}.`;
}

async function call<T>(
	config: PayoutApiConfig,
	path: string,
	init: { method: "GET" | "POST"; body?: unknown; token?: string },
	options: Options,
): Promise<Result<T>> {
	const headers: Record<string, string> = { "x-api-key": config.apiKey };
	if (init.body !== undefined) headers["Content-Type"] = "application/json";
	if (init.token) headers.Authorization = `Bearer ${init.token}`;
	let response: Response;
	try {
		response = await (options.fetchImpl ?? fetch)(`${config.baseUrl}${path}`, {
			method: init.method,
			headers,
			body: init.body === undefined ? undefined : JSON.stringify(init.body),
			cache: "no-store",
		});
	} catch {
		return { ok: false, message: "Couldn't reach NOWPayments." };
	}
	const body = (await response.json().catch(() => null)) as (T & { message?: string }) | null;
	if (!response.ok)
		return { ok: false, message: explainNowPaymentsError(response.status, body?.message ?? "") };
	if (body === null) return { ok: false, message: "NOWPayments sent an empty answer." };
	return { ok: true, value: body };
}

/** A 5-minute token for creating and verifying payouts. */
export async function authenticate(config: PayoutApiConfig, options: Options = {}): Promise<Result<string>> {
	const result = await call<{ token?: string }>(
		config,
		"/auth",
		{ method: "POST", body: { email: config.email, password: config.password } },
		options,
	);
	if (!result.ok) return result;
	return result.value.token
		? { ok: true, value: result.value.token }
		: { ok: false, message: "NOWPayments sent no token." };
}

/** Whether NOWPayments can pay this coin to this address (it answers OK for a valid one, an error otherwise). */
export async function validateAddress(
	config: PayoutApiConfig,
	coin: CryptoCoin,
	address: string,
	options: Options = {},
): Promise<Result<true>> {
	const result = await call<unknown>(
		config,
		"/payout/validate-address",
		{ method: "POST", body: { address, currency: coin, extra_id: null } },
		options,
	);
	return result.ok ? { ok: true, value: true } : result;
}

/** How much of a coin `cents` of USD or CAD buys right now (the stablecoins are close to, not exactly, 1:1 with USD). */
export async function estimateCoinAmount(
	config: PayoutApiConfig,
	cents: number,
	currency: string,
	coin: CryptoCoin,
	options: Options = {},
): Promise<Result<number>> {
	const query = new URLSearchParams({
		amount: (cents / 100).toFixed(2),
		currency_from: currency.toLowerCase(),
		currency_to: coin,
	});
	const result = await call<{ estimated_amount?: number | string }>(
		config,
		`/estimate?${query.toString()}`,
		{ method: "GET" },
		options,
	);
	if (!result.ok) return result;
	const amount = Number(result.value.estimated_amount);
	return Number.isFinite(amount) && amount > 0
		? { ok: true, value: Math.floor(amount * 100) / 100 }
		: { ok: false, message: "NOWPayments couldn't price the payout." };
}

export type Withdrawal = { address: string; coin: CryptoCoin; amount: number; description: string };

/** Creates one batch for all the withdrawals. Nothing is sent until the batch is verified. */
export async function createPayoutBatch(
	config: PayoutApiConfig,
	token: string,
	withdrawals: readonly Withdrawal[],
	options: Options = {},
): Promise<Result<{ batchId: string; payoutIds: string[] }>> {
	const result = await call<{ id?: string | number; withdrawals?: Array<{ id?: string | number }> }>(
		config,
		"/payout",
		{
			method: "POST",
			token,
			body: {
				withdrawals: withdrawals.map((w) => ({
					address: w.address,
					currency: w.coin,
					amount: w.amount,
					payout_description: w.description.slice(0, 100),
				})),
			},
		},
		options,
	);
	if (!result.ok) return result;
	const batchId = result.value.id === undefined ? "" : String(result.value.id);
	const payoutIds = (result.value.withdrawals ?? []).map((w) => String(w.id ?? "")).filter(Boolean);
	return batchId
		? { ok: true, value: { batchId, payoutIds } }
		: { ok: false, message: "NOWPayments didn't return the batch." };
}

/** Releases a batch with the account's 2FA code. */
export async function verifyPayoutBatch(
	config: PayoutApiConfig,
	token: string,
	batchId: string,
	code: string,
	options: Options = {},
): Promise<Result<true>> {
	const result = await call<unknown>(
		config,
		`/payout/${encodeURIComponent(batchId)}/verify`,
		{ method: "POST", token, body: { verification_code: code } },
		options,
	);
	return result.ok ? { ok: true, value: true } : result;
}

export type PayoutState = "pending" | "finished" | "failed";

/** One payout's progress, folded to what the ledger needs: still going, done, or never going to arrive. */
export async function getPayoutState(
	config: PayoutApiConfig,
	payoutId: string,
	options: Options = {},
): Promise<Result<PayoutState>> {
	const result = await call<{ status?: string }>(
		config,
		`/payout/${encodeURIComponent(payoutId)}`,
		{ method: "GET" },
		options,
	);
	if (!result.ok) return result;
	const status = String(result.value.status ?? "").toLowerCase();
	if (status === "finished") return { ok: true, value: "finished" };
	if (status === "rejected" || status === "failed") return { ok: true, value: "failed" };
	return { ok: true, value: "pending" };
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input: string): Buffer {
	const clean = input.toUpperCase().replace(/=+$/, "");
	let bits = 0;
	let value = 0;
	const out: number[] = [];
	for (const char of clean) {
		const index = BASE32.indexOf(char);
		if (index < 0) throw new Error("Not a base32 secret.");
		value = (value << 5) | index;
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 0xff);
			bits -= 8;
		}
	}
	return Buffer.from(out);
}

/**
 * The 6-digit authenticator code for a moment (RFC 6238: HMAC-SHA1, 30-second steps), from the account's base32 secret.
 * `secret` may also be given as raw bytes (for the RFC's test vectors). Returns null for an unreadable secret.
 */
export function totp(secret: string | Buffer, at: Date, digits = 6): string | null {
	let key: Buffer;
	try {
		key = typeof secret === "string" ? base32Decode(secret) : secret;
	} catch {
		return null;
	}
	if (key.length === 0) return null;
	const counter = Math.floor(at.getTime() / 1000 / 30);
	const message = Buffer.alloc(8);
	message.writeBigUInt64BE(BigInt(counter));
	const hmac = createHmac("sha1", key).update(message).digest();
	const offset = hmac[hmac.length - 1]! & 0x0f;
	const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
	return String(code).padStart(digits, "0");
}
