import "server-only";

import { saleorGraphqlUrl } from "@/lib/saleor-endpoint";

/**
 * The one place the payments app calls Saleor's API itself. Everything else answers Saleor's webhooks; this is for results
 * that arrive later, outside any Saleor request (a crypto payment confirming minutes after checkout).
 *
 * It authenticates with an app token created in the Saleor Dashboard (Apps → Worldwide Vapor Payments → create token) and
 * stored as PAYMENTS_APP_TOKEN. The token needs only the HANDLE_PAYMENTS permission the app already has.
 */

const REPORT_EVENT = `mutation TransactionEventReport(
	$id: ID!
	$type: TransactionEventTypeEnum!
	$amount: PositiveDecimal!
	$pspReference: String!
	$message: String
) {
	transactionEventReport(id: $id, type: $type, amount: $amount, pspReference: $pspReference, message: $message) {
		alreadyProcessed
		errors { field message code }
	}
}`;

export type ReportableEventType = "CHARGE_SUCCESS" | "CHARGE_FAILURE";

export type ReportEventInput = {
	/** Saleor transaction ID (the `order_id` we handed the crypto provider). */
	transactionId: string;
	type: ReportableEventType;
	amount: number;
	pspReference: string;
	message?: string;
};

export type ReportEventOutcome =
	| { ok: true; alreadyProcessed: boolean }
	| { ok: false; message: string; retryable: boolean };

export function readPaymentsAppToken(env: Record<string, string | undefined> = process.env): string | null {
	return env.PAYMENTS_APP_TOKEN?.trim() || null;
}

/**
 * Reports a payment result to Saleor. Saleor de-duplicates on (type, pspReference), so a provider retrying the same callback
 * is harmless — `alreadyProcessed` comes back true instead of the payment being counted twice.
 */
export async function reportTransactionEvent(
	input: ReportEventInput,
	options: { apiUrl?: string; token?: string | null; fetchImpl?: typeof fetch } = {},
): Promise<ReportEventOutcome> {
	const apiUrl = saleorGraphqlUrl(options.apiUrl ?? process.env.NEXT_PUBLIC_SALEOR_API_URL);
	const token = options.token === undefined ? readPaymentsAppToken() : options.token;
	if (!apiUrl) return { ok: false, message: "NEXT_PUBLIC_SALEOR_API_URL is not set.", retryable: false };
	if (!token) return { ok: false, message: "PAYMENTS_APP_TOKEN is not set.", retryable: false };

	let response: Response;
	try {
		response = await (options.fetchImpl ?? fetch)(apiUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({
				query: REPORT_EVENT,
				variables: {
					id: input.transactionId,
					type: input.type,
					amount: input.amount,
					pspReference: input.pspReference,
					message: input.message,
				},
			}),
			cache: "no-store",
		});
	} catch {
		return { ok: false, message: "Couldn't reach Saleor.", retryable: true };
	}

	if (!response.ok) {
		// 4xx means our request/token is wrong and a retry won't fix it; 5xx and rate limits might clear.
		return {
			ok: false,
			message: `Saleor answered ${response.status}.`,
			retryable: response.status >= 500 || response.status === 429,
		};
	}

	const body = (await response.json().catch(() => null)) as {
		data?: {
			transactionEventReport?: {
				alreadyProcessed?: boolean | null;
				errors?: Array<{ message?: string | null; code?: string | null }>;
			} | null;
		};
		errors?: Array<{ message?: string }>;
	} | null;

	const payload = body?.data?.transactionEventReport;
	if (!payload) {
		return {
			ok: false,
			message: body?.errors?.[0]?.message ?? "Saleor returned no result.",
			retryable: false,
		};
	}
	if (payload.errors?.length) {
		return {
			ok: false,
			message: payload.errors[0]?.message ?? "Saleor rejected the report.",
			retryable: false,
		};
	}
	return { ok: true, alreadyProcessed: Boolean(payload.alreadyProcessed) };
}
