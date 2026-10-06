import "server-only";

import { readPaymentsAppToken } from "@/lib/payments-app/saleor-api";
import {
	RECORD_METADATA_KEY,
	STATUS_METADATA_KEY,
	parseRecord,
	serializeRecord,
	type InstallmentRecord,
} from "./record";

/**
 * Everything the installment job needs from Saleor's API: read orders, store the plan on an order, leave a staff note. It
 * authenticates with PAYMENTS_APP_TOKEN, so the payments app needs the MANAGE_ORDERS permission as well as HANDLE_PAYMENTS
 * (reinstall it after this change, see docs/payments-setup.md).
 *
 * Nothing here throws: a failure comes back as `{ ok: false }` so the job can carry on with the next order.
 */

const ORDER_FIELDS = `
	id
	number
	created
	status
	userEmail
	user { email }
	channel { slug }
	total { gross { amount currency } }
	transactions { id pspReference chargedAmount { amount } }
	privateMetafield(key: "${RECORD_METADATA_KEY}")`;

export const ORDER_QUERY = `query InstallmentOrder($id: ID!) {
	order(id: $id) {${ORDER_FIELDS}
	}
}`;

/** Orders whose plan is still running. The public marker is the only thing Saleor can filter on. */
export const ACTIVE_ORDERS_QUERY = `query ActiveInstallmentOrders($after: String, $filter: OrderFilterInput) {
	orders(first: 100, after: $after, filter: $filter) {
		edges { node {${ORDER_FIELDS}
		} }
		pageInfo { hasNextPage endCursor }
	}
}`;

export const SAVE_PLAN_MUTATION = `mutation SaveInstallmentPlan($id: ID!, $private: [MetadataInput!]!, $public: [MetadataInput!]!) {
	updatePrivateMetadata(id: $id, input: $private) { errors { field message code } }
	updateMetadata(id: $id, input: $public) { errors { field message code } }
}`;

export const ORDER_NOTE_MUTATION = `mutation InstallmentOrderNote($id: ID!, $message: String!) {
	orderNoteAdd(order: $id, input: { message: $message }) { errors { field message code } }
}`;

export type OrderTransaction = { id: string; pspReference: string | null; chargedCents: number };

export type OrderSnapshot = {
	id: string;
	number: string;
	createdAt: string;
	/** Saleor's order status, e.g. UNFULFILLED, FULFILLED, CANCELED. */
	status: string;
	email: string | null;
	channel: string;
	currency: string;
	totalCents: number;
	transactions: OrderTransaction[];
	/** The stored plan, or null when there is none — or when what is stored can't be read (see `unreadablePlan`). */
	record: InstallmentRecord | null;
	/** A plan is stored but is damaged. It must not be replaced by a fresh one: that could charge the shopper twice. */
	unreadablePlan: boolean;
};

export type SaleorResult<T> = { ok: true; value: T } | { ok: false; message: string };

type Raw = {
	id?: string;
	number?: string;
	created?: string;
	status?: string;
	userEmail?: string | null;
	user?: { email?: string | null } | null;
	channel?: { slug?: string } | null;
	total?: { gross?: { amount?: number; currency?: string } } | null;
	transactions?: Array<{
		id?: string;
		pspReference?: string | null;
		chargedAmount?: { amount?: number } | null;
	}> | null;
	privateMetafield?: string | null;
};

const toCents = (amount: number | undefined): number => Math.round((amount ?? 0) * 100);

/** Turns Saleor's order into our snapshot. Null when it lacks something essential. */
export function toSnapshot(raw: Raw | null | undefined): OrderSnapshot | null {
	if (!raw?.id || !raw.number || !raw.created || !raw.channel?.slug) return null;
	const gross = raw.total?.gross;
	if (typeof gross?.amount !== "number" || !gross.currency) return null;

	const stored = raw.privateMetafield ?? null;
	const record = parseRecord(stored);
	return {
		id: raw.id,
		number: String(raw.number),
		createdAt: raw.created,
		status: raw.status ?? "",
		email: raw.userEmail ?? raw.user?.email ?? null,
		channel: raw.channel.slug,
		currency: gross.currency.toUpperCase(),
		totalCents: toCents(gross.amount),
		transactions: (raw.transactions ?? []).flatMap((transaction) =>
			transaction.id
				? [
						{
							id: transaction.id,
							pspReference: transaction.pspReference ?? null,
							chargedCents: toCents(transaction.chargedAmount?.amount),
						},
					]
				: [],
		),
		record,
		unreadablePlan: !!stored && !record,
	};
}

type Options = { apiUrl?: string; token?: string | null; fetchImpl?: typeof fetch };

type GraphQLBody<T> = { data?: T | null; errors?: Array<{ message?: string }> };

async function request<T>(
	query: string,
	variables: Record<string, unknown>,
	options: Options,
): Promise<SaleorResult<T>> {
	const apiUrl = (options.apiUrl ?? process.env.NEXT_PUBLIC_SALEOR_API_URL)?.replace(/\/+$/, "");
	const token = options.token === undefined ? readPaymentsAppToken() : options.token;
	if (!apiUrl) return { ok: false, message: "NEXT_PUBLIC_SALEOR_API_URL is not set." };
	if (!token) return { ok: false, message: "PAYMENTS_APP_TOKEN is not set." };

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
	// A permission problem arrives as an error alongside null fields; surface it rather than treating it as "no orders".
	if (body.errors?.length)
		return { ok: false, message: body.errors[0]?.message ?? "Saleor reported an error." };
	return { ok: true, value: body.data };
}

export async function fetchOrder(
	id: string,
	options: Options = {},
): Promise<SaleorResult<OrderSnapshot | null>> {
	const result = await request<{ order?: Raw | null }>(ORDER_QUERY, { id }, options);
	if (!result.ok) return result;
	return { ok: true, value: toSnapshot(result.value.order) };
}

type Page = {
	orders?: {
		edges?: Array<{ node?: Raw | null }>;
		pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
	} | null;
};

/** Safety valve: never page through more than this many pages (100 orders each) in one run. */
const MAX_PAGES = 20;

async function listOrders(
	filter: Record<string, unknown>,
	options: Options,
): Promise<SaleorResult<OrderSnapshot[]>> {
	const found: OrderSnapshot[] = [];
	let after: string | null = null;
	for (let page = 0; page < MAX_PAGES; page += 1) {
		const result: SaleorResult<Page> = await request<Page>(ACTIVE_ORDERS_QUERY, { after, filter }, options);
		if (!result.ok) return result;
		const connection: Page["orders"] = result.value.orders;
		for (const edge of connection?.edges ?? []) {
			const snapshot = toSnapshot(edge.node);
			if (snapshot) found.push(snapshot);
		}
		if (!connection?.pageInfo?.hasNextPage || !connection.pageInfo.endCursor) break;
		after = connection.pageInfo.endCursor;
	}
	return { ok: true, value: found };
}

/** Orders whose installment plan is active. */
export const listActiveOrders = (options: Options = {}) =>
	listOrders({ metadata: [{ key: STATUS_METADATA_KEY, value: "active" }] }, options);

/** Orders placed since `sinceDate` (YYYY-MM-DD): the job checks these for installment orders that never got a plan. */
export const listOrdersSince = (sinceDate: string, options: Options = {}) =>
	listOrders({ created: { gte: sinceDate } }, options);

type Errors = { errors?: Array<{ message?: string | null }> } | null;

/** Stores the plan on the order: the full record privately, and just its status publicly so it can be found. */
export async function savePlan(
	orderId: string,
	record: InstallmentRecord,
	options: Options = {},
): Promise<SaleorResult<true>> {
	const result = await request<{ updatePrivateMetadata?: Errors; updateMetadata?: Errors }>(
		SAVE_PLAN_MUTATION,
		{
			id: orderId,
			private: [{ key: RECORD_METADATA_KEY, value: serializeRecord(record) }],
			public: [{ key: STATUS_METADATA_KEY, value: record.status }],
		},
		options,
	);
	if (!result.ok) return result;
	const error = result.value.updatePrivateMetadata?.errors?.[0] ?? result.value.updateMetadata?.errors?.[0];
	if (error) return { ok: false, message: error.message ?? "Saleor rejected the plan." };
	return { ok: true, value: true };
}

/** A note on the order, visible to staff in the Dashboard. */
export async function addOrderNote(
	orderId: string,
	message: string,
	options: Options = {},
): Promise<SaleorResult<true>> {
	const result = await request<{ orderNoteAdd?: Errors }>(
		ORDER_NOTE_MUTATION,
		{ id: orderId, message },
		options,
	);
	if (!result.ok) return result;
	const error = result.value.orderNoteAdd?.errors?.[0];
	if (error) return { ok: false, message: error.message ?? "Saleor rejected the note." };
	return { ok: true, value: true };
}
