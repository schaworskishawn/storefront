import "server-only";

import { saleorGraphqlUrl } from "@/lib/saleor-endpoint";
import type { AffiliateAccount, AffiliateOrder, Result } from "./engine";
import type { LedgerOrder } from "./ledger";
import {
	AFFILIATE_KEYS,
	parseAffiliateRecord,
	parseOrderStamp,
	serializeAffiliateRecord,
	serializeOrderStamp,
	type AffiliateRecord,
	type OrderStamp,
} from "./records";

/**
 * Everything the affiliate program needs from Saleor: read an order and stamp its credit, leave an order note, list the
 * customers with an affiliate record and read or save one, and list the orders credited to a code. It authenticates with
 * AFFILIATE_APP_TOKEN, the token of the "Worldwide Vapor Affiliates" app (MANAGE_ORDERS and MANAGE_USERS; see
 * docs/payments-setup.md).
 *
 * Nothing here throws: a failure comes back as `{ ok: false }` so a webhook or a page can answer sensibly.
 */

type Options = { apiUrl?: string; token?: string | null; fetchImpl?: typeof fetch };

export const readAffiliateAppToken = (env: Record<string, string | undefined> = process.env): string | null =>
	env.AFFILIATE_APP_TOKEN?.trim() || null;

/** Whether the affiliates app is set up here (its token is present). */
export const isAffiliateAppConfigured = (): boolean => readAffiliateAppToken() !== null;

type GraphQLBody<T> = { data?: T | null; errors?: Array<{ message?: string }> };
type Errors = { errors?: Array<{ message?: string | null }> | null } | null | undefined;

const firstError = (payload: Errors): string | null => payload?.errors?.[0]?.message ?? null;

async function request<T>(
	query: string,
	variables: Record<string, unknown>,
	options: Options,
): Promise<Result<T>> {
	const apiUrl = saleorGraphqlUrl(options.apiUrl ?? process.env.NEXT_PUBLIC_SALEOR_API_URL);
	const token = options.token === undefined ? readAffiliateAppToken() : options.token;
	if (!apiUrl) return { ok: false, message: "NEXT_PUBLIC_SALEOR_API_URL is not set." };
	if (!token) return { ok: false, message: "AFFILIATE_APP_TOKEN is not set." };

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
	// A permission problem arrives as an error beside null fields; say so rather than reporting "nothing found".
	if (body.errors?.length)
		return { ok: false, message: body.errors[0]?.message ?? "Saleor reported an error." };
	return { ok: true, value: body.data };
}

const toCents = (amount: number | undefined | null): number => Math.round((amount ?? 0) * 100);

export const AFFILIATE_ORDER_QUERY = `query AffiliateOrder($id: ID!) {
	order(id: $id) {
		id
		number
		status
		userEmail
		user { id email }
		total { gross { amount currency } tax { amount } }
		subtotal { gross { amount } }
		shippingPrice { gross { amount } }
		totalCharged { amount currency }
		voucherCode
		ref: metafield(key: "${AFFILIATE_KEYS.ref}")
		stamp: privateMetafield(key: "${AFFILIATE_KEYS.orderStamp}")
	}
}`;

type RawOrder = {
	id?: string;
	number?: string;
	status?: string;
	userEmail?: string | null;
	user?: { id?: string; email?: string | null } | null;
	total?: { gross?: { amount?: number; currency?: string }; tax?: { amount?: number } | null } | null;
	subtotal?: { gross?: { amount?: number } } | null;
	shippingPrice?: { gross?: { amount?: number } } | null;
	totalCharged?: { amount?: number; currency?: string } | null;
	voucherCode?: string | null;
	ref?: string | null;
	stamp?: string | null;
};

export function toAffiliateOrder(raw: RawOrder | null | undefined): AffiliateOrder | null {
	if (!raw?.id || !raw.number) return null;
	const gross = raw.total?.gross;
	if (typeof gross?.amount !== "number" || !gross.currency) return null;
	return {
		id: raw.id,
		number: String(raw.number),
		status: raw.status ?? "",
		userId: raw.user?.id ?? null,
		email: raw.userEmail ?? raw.user?.email ?? null,
		currency: gross.currency.toUpperCase(),
		chargedCents: toCents(raw.totalCharged?.amount),
		shippingCents: toCents(raw.shippingPrice?.gross?.amount),
		taxCents: toCents(raw.total?.tax?.amount),
		subtotalCents: toCents(raw.subtotal?.gross?.amount),
		voucherCode: raw.voucherCode?.trim() || null,
		ref: raw.ref ?? null,
		stamp: parseOrderStamp(raw.stamp),
	};
}

export async function fetchAffiliateOrder(
	id: string,
	options: Options = {},
): Promise<Result<AffiliateOrder | null>> {
	const result = await request<{ order?: RawOrder | null }>(AFFILIATE_ORDER_QUERY, { id }, options);
	if (!result.ok) return result;
	return { ok: true, value: toAffiliateOrder(result.value.order) };
}

/** The credit privately, and the credited code publicly (so the affiliate's orders can be found), in one request. */
export const STAMP_ORDER_MUTATION = `mutation StampAffiliateOrder($id: ID!, $private: [MetadataInput!]!, $public: [MetadataInput!]!) {
	privateUpdate: updatePrivateMetadata(id: $id, input: $private) { errors { field message code } }
	publicUpdate: updateMetadata(id: $id, input: $public) { errors { field message code } }
}`;

export async function stampAffiliateOrder(
	orderId: string,
	stamp: OrderStamp,
	options: Options = {},
): Promise<Result<void>> {
	const result = await request<{ privateUpdate?: Errors; publicUpdate?: Errors }>(
		STAMP_ORDER_MUTATION,
		{
			id: orderId,
			private: [{ key: AFFILIATE_KEYS.orderStamp, value: serializeOrderStamp(stamp) }],
			public: [{ key: AFFILIATE_KEYS.orderCode, value: stamp.code }],
		},
		options,
	);
	if (!result.ok) return result;
	const error = firstError(result.value.privateUpdate) ?? firstError(result.value.publicUpdate);
	return error ? { ok: false, message: error } : { ok: true, value: undefined };
}

export const ORDER_NOTE_MUTATION = `mutation AffiliateOrderNote($id: ID!, $message: String!) {
	orderNoteAdd(order: $id, input: { message: $message }) { errors { field message code } }
}`;

export async function addAffiliateOrderNote(
	orderId: string,
	message: string,
	options: Options = {},
): Promise<Result<void>> {
	const result = await request<{ orderNoteAdd?: Errors }>(
		ORDER_NOTE_MUTATION,
		{ id: orderId, message },
		options,
	);
	if (!result.ok) return result;
	const error = firstError(result.value.orderNoteAdd);
	return error ? { ok: false, message: error } : { ok: true, value: undefined };
}

const ACCOUNT_FIELDS = `
	id
	email
	firstName
	lastName
	record: privateMetafield(key: "${AFFILIATE_KEYS.record}")`;

/** Customers with an affiliate record: found by the public status copy, each then read from its private record. */
export const AFFILIATES_QUERY = `query AffiliateAccounts($after: String) {
	customers(first: 100, after: $after, filter: { metadata: [{ key: "${AFFILIATE_KEYS.indexStatus}" }] }) {
		edges { node {${ACCOUNT_FIELDS}
		} }
		pageInfo { hasNextPage endCursor }
	}
}`;

export const AFFILIATE_QUERY = `query AffiliateAccount($id: ID!) {
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

const toAccount = (raw: RawAccount | null | undefined, record: AffiliateRecord): AffiliateAccount => ({
	userId: raw?.id ?? "",
	email: raw?.email ?? "",
	name: [raw?.firstName, raw?.lastName].filter(Boolean).join(" ") || raw?.email || "",
	record,
});

/** Every customer with a readable affiliate record, any status. */
export async function listAffiliateAccounts(options: Options = {}): Promise<Result<AffiliateAccount[]>> {
	const accounts: AffiliateAccount[] = [];
	let after: string | null = null;
	for (let page = 0; page < 50; page++) {
		const result: Result<{
			customers?: {
				edges?: { node?: RawAccount | null }[] | null;
				pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
			} | null;
		}> = await request(AFFILIATES_QUERY, { after }, options);
		if (!result.ok) return result;
		for (const edge of result.value.customers?.edges ?? []) {
			const record = parseAffiliateRecord(edge.node?.record);
			if (edge.node?.id && record) accounts.push(toAccount(edge.node, record));
		}
		const info: { hasNextPage?: boolean; endCursor?: string | null } | undefined =
			result.value.customers?.pageInfo;
		if (!info?.hasNextPage || !info.endCursor) break;
		after = info.endCursor;
	}
	return { ok: true, value: accounts };
}

/** One customer's affiliate account; `value` is null when they have no record. */
export async function getAffiliateAccount(
	userId: string,
	options: Options = {},
): Promise<Result<AffiliateAccount | null>> {
	const result = await request<{ user?: RawAccount | null }>(AFFILIATE_QUERY, { id: userId }, options);
	if (!result.ok) return result;
	const record = parseAffiliateRecord(result.value.user?.record);
	return { ok: true, value: result.value.user?.id && record ? toAccount(result.value.user, record) : null };
}

export const SAVE_ACCOUNT_MUTATION = `mutation SaveAffiliateAccount($id: ID!, $private: [MetadataInput!]!, $public: [MetadataInput!]!) {
	privateUpdate: updatePrivateMetadata(id: $id, input: $private) { errors { field message code } }
	publicUpdate: updateMetadata(id: $id, input: $public) { errors { field message code } }
}`;

/** Saves a customer's record, and the public copies that let Saleor find them. */
export async function saveAffiliateRecord(
	userId: string,
	record: AffiliateRecord,
	options: Options = {},
): Promise<Result<void>> {
	const publicCopies: { key: string; value: string }[] = [
		{ key: AFFILIATE_KEYS.indexStatus, value: record.status },
	];
	if (record.code) publicCopies.push({ key: AFFILIATE_KEYS.indexCode, value: record.code });
	const result = await request<{ privateUpdate?: Errors; publicUpdate?: Errors }>(
		SAVE_ACCOUNT_MUTATION,
		{
			id: userId,
			private: [{ key: AFFILIATE_KEYS.record, value: serializeAffiliateRecord(record) }],
			public: publicCopies,
		},
		options,
	);
	if (!result.ok) return result;
	const error = firstError(result.value.privateUpdate) ?? firstError(result.value.publicUpdate);
	return error ? { ok: false, message: error } : { ok: true, value: undefined };
}

/** Orders credited to a code: found by the app's public copy, then read from each order's private stamp. */
export const CREDITED_ORDERS_QUERY = `query AffiliateCreditedOrders($code: String!, $after: String) {
	orders(first: 100, after: $after, filter: { metadata: [{ key: "${AFFILIATE_KEYS.orderCode}", value: $code }] }) {
		edges { node {
			id
			number
			stamp: privateMetafield(key: "${AFFILIATE_KEYS.orderStamp}")
		} }
		pageInfo { hasNextPage endCursor }
	}
}`;

/** The orders credited to an affiliate (by code and by their customer id, so a public copy can't add orders). */
export async function listCreditedOrders(
	code: string,
	affiliateId: string,
	options: Options = {},
): Promise<Result<LedgerOrder[]>> {
	const orders: LedgerOrder[] = [];
	let after: string | null = null;
	for (let page = 0; page < 50; page++) {
		const result: Result<{
			orders?: {
				edges?: { node?: { id?: string; number?: string; stamp?: string | null } | null }[] | null;
				pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
			} | null;
		}> = await request(CREDITED_ORDERS_QUERY, { code, after }, options);
		if (!result.ok) return result;
		for (const edge of result.value.orders?.edges ?? []) {
			const stamp = parseOrderStamp(edge.node?.stamp);
			if (edge.node?.id && stamp && stamp.code === code && stamp.affiliateId === affiliateId)
				orders.push({ orderId: edge.node.id, number: String(edge.node.number ?? ""), stamp });
		}
		const info: { hasNextPage?: boolean; endCursor?: string | null } | undefined =
			result.value.orders?.pageInfo;
		if (!info?.hasNextPage || !info.endCursor) break;
		after = info.endCursor;
	}
	return { ok: true, value: orders };
}
