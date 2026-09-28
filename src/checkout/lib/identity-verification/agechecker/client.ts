import "server-only";
import { getAgeCheckerAccountSecret, getAgeCheckerApiKey } from "./env";
import type { AgeCheckerStatus } from "./keys";

/**
 * Thin server-side wrapper around AgeChecker.Net's REST API (https://api.agechecker.net/v1/...).
 * Plain `fetch` — no SDK/npm package exists or is needed for this provider, unlike Stripe Identity.
 *
 * Verified against the real docs pulled from the account's own dashboard (Install > Server API
 * Documentation), not guessed — see conversation history. Do not "fill in" endpoints or fields
 * that aren't in that doc without re-checking it first.
 */

const API_BASE = "https://api.agechecker.net/v1";

export type AgeCheckerCustomerData = {
	firstName: string;
	lastName: string;
	address: string;
	city: string;
	/** 2-character state/province code. */
	state: string;
	zip: string;
	/** 2-character ISO country code. */
	country: string;
	dobDay: number;
	dobMonth: number;
	dobYear: number;
	email?: string;
};

export type AgeCheckerErrorBody = { error: { code: string; message: string } };

export class AgeCheckerApiError extends Error {
	code: string;
	constructor(code: string, message: string) {
		super(message);
		this.code = code;
		this.name = "AgeCheckerApiError";
	}
}

function requireApiKey(): string {
	const key = getAgeCheckerApiKey();
	if (!key) {
		throw new Error(
			"NEXT_PUBLIC_AGECHECKER_API_KEY is not set — AgeChecker verification should have been " +
				"gated behind isAgeCheckerVerificationEnabled() before reaching here.",
		);
	}
	return key;
}

async function parseOrThrow<T>(response: Response): Promise<T> {
	const body = (await response.json()) as T | AgeCheckerErrorBody;
	if (!response.ok || (body && typeof body === "object" && "error" in body)) {
		const errorBody = body as AgeCheckerErrorBody;
		throw new AgeCheckerApiError(
			errorBody.error?.code ?? "unknown_error",
			errorBody.error?.message ?? `AgeChecker request failed with status ${response.status}`,
		);
	}
	return body as T;
}

export type CreateVerificationResult = {
	/** Absent when status is "not_created" (blocked region / underage / disabled / banned). */
	uuid?: string;
	status: AgeCheckerStatus;
};

/**
 * Creates a new verification request (`POST /v1/create`). The account secret is only attached
 * (and `options` only sent) when configured — without it, AgeChecker's account/site-level default
 * minimum age still applies; we just can't override it per-request or set a webhook callback URL.
 */
export async function createAgeCheckerVerification(
	data: AgeCheckerCustomerData,
	opts?: { customerIp?: string; metadata?: Record<string, string> },
): Promise<CreateVerificationResult> {
	const secret = getAgeCheckerAccountSecret();

	const body: Record<string, unknown> = {
		key: requireApiKey(),
		data: {
			first_name: data.firstName,
			last_name: data.lastName,
			address: data.address,
			city: data.city,
			state: data.state,
			zip: data.zip,
			country: data.country,
			dob_day: data.dobDay,
			dob_month: data.dobMonth,
			dob_year: data.dobYear,
			...(data.email ? { email: data.email } : {}),
		},
	};

	// `options` requires the secret per AgeChecker's docs — omit entirely rather than send a
	// request that will be rejected.
	if (secret) {
		body.secret = secret;
		if (opts?.customerIp || opts?.metadata) {
			body.options = {
				...(opts.customerIp ? { customer_ip: opts.customerIp } : {}),
				...(opts.metadata ? { metadata: opts.metadata } : {}),
			};
		}
	}

	const response = await fetch(`${API_BASE}/create`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		cache: "no-store",
	});

	return parseOrThrow<CreateVerificationResult>(response);
}

export type VerificationStatusResult = {
	status: AgeCheckerStatus;
	/** Only present when status is "denied". */
	reason?: string;
};

/** Reads the current status of a verification (`GET /v1/status/:uuid`). No secret required. */
export async function getAgeCheckerVerificationStatus(uuid: string): Promise<VerificationStatusResult> {
	const response = await fetch(`${API_BASE}/status/${encodeURIComponent(uuid)}`, {
		method: "GET",
		cache: "no-store",
	});

	return parseOrThrow<VerificationStatusResult>(response);
}
