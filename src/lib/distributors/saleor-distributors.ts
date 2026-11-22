import "server-only";

import { saleorGraphqlUrl } from "@/lib/saleor-endpoint";
import type { LineUpdate, PricingLine } from "./pricing";
import {
	DISTRIBUTOR_KEYS,
	parseDistributorRecord,
	serializeDistributorRecord,
	type DistributorRecord,
} from "./records";

/**
 * Everything the distributor program needs from Saleor, through DISTRIBUTOR_APP_TOKEN (the "Worldwide Vapor Distributors"
 * app: MANAGE_USERS to keep each distributor's record on their account, HANDLE_CHECKOUTS to set their wholesale prices;
 * see docs/payments-setup.md):
 *
 * - list the customers with a distributor record, read or save one;
 * - read a checkout's lines, list prices and buyer for pricing, and set or clear line prices.
 *
 * Nothing here throws: a failure comes back as `{ ok: false }`.
 */

export type Result<T> = { ok: true; value: T } | { ok: false; message: string };
type Options = { apiUrl?: string; token?: string | null; fetchImpl?: typeof fetch };

export const readDistributorAppToken = (
	env: Record<string, string | undefined> = process.env,
): string | null => env.DISTRIBUTOR_APP_TOKEN?.trim() || null;

export const isDistributorAppConfigured = (): boolean => readDistributorAppToken() !== null;

type GraphQLBody<T> = { data?: T | null; errors?: Array<{ message?: string }> };
type Errors = { errors?: Array<{ message?: string | null }> | null } | null | undefined;
const firstError = (payload: Errors): string | null => payload?.errors?.[0]?.message ?? null;

async function request<T>(
	query: string,
	variables: Record<string, unknown>,
	options: Options,
): Promise<Result<T>> {
	const apiUrl = saleorGraphqlUrl(options.apiUrl ?? process.env.NEXT_PUBLIC_SALEOR_API_URL);
	const token = options.token === undefined ? readDistributorAppToken() : options.token;
	if (!apiUrl) return { ok: false, message: "NEXT_PUBLIC_SALEOR_API_URL is not set." };
	if (!token) return { ok: false, message: "DISTRIBUTOR_APP_TOKEN is not set." };
	let response: Response;
	try {
		response = await (options.fetchImpl ?? fetch)(apiUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
			body: JSON.stringify({ query, variables }),
			cache: "no-store",
		});
	} catch {
		return { ok: false, message: "Couldn't reach Saleor." };
	}
	if (!response.ok) return { ok: false, message: `Saleor answered ${response.status}.` };
	const body = (await response.json().catch(() => null)) as GraphQLBody<T> | null;
	if (!body?.data) return { ok: false, message: body?.errors?.[0]?.message ?? "Saleor returned no data." };
	if (body.errors?.length)
		return { ok: false, message: body.errors[0]?.message ?? "Saleor reported an error." };
	return { ok: true, value: body.data };
}

// Accounts ------------------------------------------------------------------------------------------------------------

export type DistributorAccount = { userId: string; email: string; name: string; record: DistributorRecord };

const ACCOUNT_FIELDS = `
	id
	email
	firstName
	lastName
	record: privateMetafield(key: "${DISTRIBUTOR_KEYS.record}")`;

const ACCOUNTS_QUERY = `query DistributorAccounts($after: String) {
	customers(first: 100, after: $after, filter: { metadata: [{ key: "${DISTRIBUTOR_KEYS.indexStatus}" }] }) {
		edges { node {${ACCOUNT_FIELDS}
		} }
		pageInfo { hasNextPage endCursor }
	}
}`;

const ACCOUNT_QUERY = `query DistributorAccount($id: ID!) {
	user(id: $id) {${ACCOUNT_FIELDS}
	}
}`;

type RawAccount = {
	id?: string;
	email?: string | null;
	firstName?: string | null;
	lastName?: string | null;
	record?: string | null;
};

const toAccount = (raw: RawAccount, record: DistributorRecord): DistributorAccount => ({
	userId: raw.id ?? "",
	email: raw.email ?? "",
	name: [raw.firstName, raw.lastName].filter(Boolean).join(" ") || raw.email || "",
	record,
});

/** Every customer with a readable distributor record, any status. */
export async function listDistributorAccounts(options: Options = {}): Promise<Result<DistributorAccount[]>> {
	const accounts: DistributorAccount[] = [];
	let after: string | null = null;
	for (let page = 0; page < 50; page++) {
		const result: Result<{
			customers?: {
				edges?: { node?: RawAccount | null }[] | null;
				pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
			} | null;
		}> = await request(ACCOUNTS_QUERY, { after }, options);
		if (!result.ok) return result;
		for (const edge of result.value.customers?.edges ?? []) {
			const record = parseDistributorRecord(edge.node?.record);
			if (edge.node?.id && record) accounts.push(toAccount(edge.node, record));
		}
		const info: { hasNextPage?: boolean; endCursor?: string | null } | undefined =
			result.value.customers?.pageInfo;
		if (!info?.hasNextPage || !info.endCursor) break;
		after = info.endCursor;
	}
	return { ok: true, value: accounts };
}

/** One customer's distributor account; `value` is null when they have no record. */
export async function getDistributorAccount(
	userId: string,
	options: Options = {},
): Promise<Result<DistributorAccount | null>> {
	const result = await request<{ user?: RawAccount | null }>(ACCOUNT_QUERY, { id: userId }, options);
	if (!result.ok) return result;
	const user = result.value.user;
	const record = parseDistributorRecord(user?.record);
	return { ok: true, value: user?.id && record ? toAccount(user, record) : null };
}

const SAVE_MUTATION = `mutation SaveDistributor($id: ID!, $private: [MetadataInput!]!, $public: [MetadataInput!]!) {
	privateUpdate: updatePrivateMetadata(id: $id, input: $private) { errors { field message code } }
	publicUpdate: updateMetadata(id: $id, input: $public) { errors { field message code } }
}`;

/** Saves a customer's record, and the public copies that let Saleor find them. */
export async function saveDistributorRecord(
	userId: string,
	record: DistributorRecord,
	options: Options = {},
): Promise<Result<void>> {
	const result = await request<{ privateUpdate?: Errors; publicUpdate?: Errors }>(
		SAVE_MUTATION,
		{
			id: userId,
			private: [{ key: DISTRIBUTOR_KEYS.record, value: serializeDistributorRecord(record) }],
			public: [
				{ key: DISTRIBUTOR_KEYS.indexStatus, value: record.status },
				{ key: DISTRIBUTOR_KEYS.indexTier, value: record.tierId ?? "" },
			],
		},
		options,
	);
	if (!result.ok) return result;
	const error = firstError(result.value.privateUpdate) ?? firstError(result.value.publicUpdate);
	return error ? { ok: false, message: error } : { ok: true, value: undefined };
}

// Checkout pricing ----------------------------------------------------------------------------------------------------

/**
 * A checkout as pricing needs it, in one request: the buyer (and their private distributor record, readable with
 * MANAGE_USERS), and each line's quantity, list price in the checkout's channel (before tax and sales) and the reason
 * stored with its current price override (readable with HANDLE_CHECKOUTS).
 */
const PRICING_CHECKOUT_QUERY = `query DistributorPricingCheckout($id: ID!) {
	checkout(id: $id) {
		id
		user {
			id
			record: privateMetafield(key: "${DISTRIBUTOR_KEYS.record}")
		}
		lines {
			id
			quantity
			priceOverrideReason
			variant {
				id
				pricing { priceUndiscounted { net { amount } } }
			}
		}
	}
}`;

type RawPricingCheckout = {
	checkout?: {
		id?: string;
		user?: { id?: string; record?: string | null } | null;
		lines?: Array<{
			id?: string;
			quantity?: number;
			priceOverrideReason?: string | null;
			variant?: {
				id?: string;
				pricing?: { priceUndiscounted?: { net?: { amount?: number } } } | null;
			} | null;
		}> | null;
	} | null;
};

export type PricingCheckout = {
	userId: string | null;
	record: DistributorRecord | null;
	lines: PricingLine[];
};

export async function fetchPricingCheckout(
	checkoutId: string,
	options: Options = {},
): Promise<Result<PricingCheckout | null>> {
	const result = await request<RawPricingCheckout>(PRICING_CHECKOUT_QUERY, { id: checkoutId }, options);
	if (!result.ok) return result;
	const checkout = result.value.checkout;
	if (!checkout?.id) return { ok: true, value: null };
	const lines: PricingLine[] = [];
	for (const line of checkout.lines ?? []) {
		const amount = line.variant?.pricing?.priceUndiscounted?.net?.amount;
		if (!line.id || typeof amount !== "number") continue;
		lines.push({
			lineId: line.id,
			quantity: line.quantity ?? 0,
			listCents: Math.round(amount * 100),
			reason: line.priceOverrideReason ?? null,
		});
	}
	return {
		ok: true,
		value: {
			userId: checkout.user?.id ?? null,
			record: parseDistributorRecord(checkout.user?.record),
			lines,
		},
	};
}

/** `price: null` clears a line's price override (Saleor treats a present-but-null `price` as "back to the list price"). */
const SET_PRICES_MUTATION = `mutation DistributorLinePrices($id: ID!, $lines: [CheckoutLineUpdateInput!]!) {
	checkoutLinesUpdate(id: $id, lines: $lines) { errors { field message code } }
}`;

export async function setCheckoutLinePrices(
	checkoutId: string,
	updates: readonly LineUpdate[],
	options: Options = {},
): Promise<Result<void>> {
	if (updates.length === 0) return { ok: true, value: undefined };
	const result = await request<{ checkoutLinesUpdate?: Errors }>(
		SET_PRICES_MUTATION,
		{ id: checkoutId, lines: updates },
		options,
	);
	if (!result.ok) return result;
	const error = firstError(result.value.checkoutLinesUpdate);
	return error ? { ok: false, message: error } : { ok: true, value: undefined };
}
