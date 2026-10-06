import "server-only";

import {
	LOT_CODE_KEY,
	LOT_ORDER_KEY,
	LOT_RESTORED_PREFIX,
	LOT_TOKENS_KEY,
	TOKEN_TAG,
	centsForTokens,
} from "./tokens";
import { saleorGraphqlUrl } from "@/lib/saleor-endpoint";
import type { TokenLot } from "./lots";

/**
 * Everything the rewards feature needs from Saleor's API: read an order, create and find a customer's token lots (gift
 * cards), keep each lot's code, adjust or deactivate a lot, leave an order note. It authenticates with REWARDS_APP_TOKEN, the
 * token of the "Worldwide Vapor Rewards" app (MANAGE_ORDERS and MANAGE_GIFT_CARD; see docs/payments-setup.md).
 *
 * Nothing here throws: a failure comes back as `{ ok: false }` so a webhook or the checkout can answer sensibly.
 */

export type RewardsResult<T> = { ok: true; value: T } | { ok: false; message: string };

type Options = { apiUrl?: string; token?: string | null; fetchImpl?: typeof fetch };

export const readRewardsAppToken = (env: Record<string, string | undefined> = process.env): string | null =>
	env.REWARDS_APP_TOKEN?.trim() || null;

type GraphQLBody<T> = { data?: T | null; errors?: Array<{ message?: string }> };

async function request<T>(
	query: string,
	variables: Record<string, unknown>,
	options: Options,
): Promise<RewardsResult<T>> {
	const apiUrl = saleorGraphqlUrl(options.apiUrl ?? process.env.NEXT_PUBLIC_SALEOR_API_URL);
	const token = options.token === undefined ? readRewardsAppToken() : options.token;
	if (!apiUrl) return { ok: false, message: "NEXT_PUBLIC_SALEOR_API_URL is not set." };
	if (!token) return { ok: false, message: "REWARDS_APP_TOKEN is not set." };

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
	// A permission problem arrives as an error beside null fields; say so rather than reporting "no tokens".
	if (body.errors?.length)
		return { ok: false, message: body.errors[0]?.message ?? "Saleor reported an error." };
	return { ok: true, value: body.data };
}

type Money = { amount?: number; currency?: string } | null;

const LOT_FIELDS = `
	id
	isActive
	expiryDate
	created
	currentBalance { amount currency }
	initialBalance { amount currency }
	orderId: metafield(key: "${LOT_ORDER_KEY}")
	code: privateMetafield(key: "${LOT_CODE_KEY}") @include(if: $withCode)`;

/** A customer's token lots. `$withCode` adds each lot's stored code, which only applying a lot to a checkout needs. */
export const LOTS_QUERY = `query VaporTokenLots($assignedTo: [ID!]!, $after: String, $withCode: Boolean!) {
	giftCards(first: 100, after: $after, filter: { tags: ["${TOKEN_TAG}"], assignedTo: $assignedTo }) {
		edges { node {${LOT_FIELDS}
		} }
		pageInfo { hasNextPage endCursor }
	}
}`;

/** The lot(s) an order earned, found by the order id on the lot. More than one means a duplicate to clean up. */
export const LOT_BY_ORDER_QUERY = `query VaporTokenLotByOrder($orderId: String!, $withCode: Boolean!) {
	giftCards(first: 5, filter: { tags: ["${TOKEN_TAG}"], metadata: [{ key: "${LOT_ORDER_KEY}", value: $orderId }] }) {
		edges { node {${LOT_FIELDS}
		} }
	}
}`;

/** A customer's lots with how each was used, for giving tokens back when an order is cancelled. */
export const LOT_USAGE_QUERY = `query VaporTokenLotUsage($assignedTo: [ID!]!, $after: String) {
	giftCards(first: 100, after: $after, filter: { tags: ["${TOKEN_TAG}"], assignedTo: $assignedTo }) {
		edges { node {
			id
			isActive
			currentBalance { amount currency }
			privateMetadata { key value }
			events { type orderId balance { currentBalance { amount } oldCurrentBalance { amount } } }
		} }
		pageInfo { hasNextPage endCursor }
	}
}`;

/** Saleor's own code for a lot. Saleor only shows it while the lot is unused, so this is for repairing a brand-new lot. */
export const LOT_CODE_QUERY = `query VaporTokenLotCode($id: ID!) {
	giftCard(id: $id) { code }
}`;

export const CREATE_LOT_MUTATION = `mutation CreateVaporTokenLot($input: GiftCardCreateInput!) {
	giftCardCreate(input: $input) {
		giftCard { id code currentBalance { amount currency } }
		errors { field message code }
	}
}`;

export const STORE_METADATA_MUTATION = `mutation StoreVaporTokenMetadata($id: ID!, $input: [MetadataInput!]!) {
	updatePrivateMetadata(id: $id, input: $input) { errors { field message code } }
}`;

export const DEACTIVATE_LOT_MUTATION = `mutation DeactivateVaporTokenLot($id: ID!) {
	giftCardDeactivate(id: $id) { errors { field message code } }
}`;

export const ADJUST_LOT_MUTATION = `mutation AdjustVaporTokenLot($id: ID!, $amount: Decimal!) {
	giftCardBalanceAdjust(id: $id, amount: $amount) {
		giftCard { id currentBalance { amount } }
		errors { field message code }
	}
}`;

export const REWARDS_ORDER_QUERY = `query RewardsOrder($id: ID!) {
	order(id: $id) {
		id
		number
		created
		status
		userEmail
		user { id email }
		channel { slug }
		total { gross { amount currency } tax { amount } }
		subtotal { gross { amount } }
		shippingPrice { gross { amount } }
		totalCharged { amount currency }
	}
}`;

export const ORDER_NOTE_MUTATION = `mutation RewardsOrderNote($id: ID!, $message: String!) {
	orderNoteAdd(order: $id, input: { message: $message }) { errors { field message code } }
}`;

const toCents = (amount: number | undefined): number => Math.round((amount ?? 0) * 100);

export type RewardsOrder = {
	id: string;
	number: string;
	createdAt: string;
	status: string;
	email: string | null;
	/** The signed-in customer who placed it. Null for a guest order, which earns nothing. */
	userId: string | null;
	channel: string;
	currency: string;
	chargedCents: number;
	shippingCents: number;
	taxCents: number;
	subtotalCents: number;
};

type RawOrder = {
	id?: string;
	number?: string;
	created?: string;
	status?: string;
	userEmail?: string | null;
	user?: { id?: string; email?: string | null } | null;
	channel?: { slug?: string } | null;
	total?: { gross?: { amount?: number; currency?: string }; tax?: { amount?: number } | null } | null;
	subtotal?: { gross?: { amount?: number } } | null;
	shippingPrice?: { gross?: { amount?: number } } | null;
	totalCharged?: { amount?: number; currency?: string } | null;
};

/** Turns Saleor's order into what the rewards need. Null when it lacks something essential. */
export function toRewardsOrder(raw: RawOrder | null | undefined): RewardsOrder | null {
	if (!raw?.id || !raw.number || !raw.created || !raw.channel?.slug) return null;
	const gross = raw.total?.gross;
	if (typeof gross?.amount !== "number" || !gross.currency) return null;
	return {
		id: raw.id,
		number: String(raw.number),
		createdAt: raw.created,
		status: raw.status ?? "",
		email: raw.userEmail ?? raw.user?.email ?? null,
		userId: raw.user?.id ?? null,
		channel: raw.channel.slug,
		currency: gross.currency.toUpperCase(),
		chargedCents: toCents(raw.totalCharged?.amount),
		shippingCents: toCents(raw.shippingPrice?.gross?.amount),
		taxCents: toCents(raw.total?.tax?.amount),
		subtotalCents: toCents(raw.subtotal?.gross?.amount),
	};
}

export async function fetchRewardsOrder(
	id: string,
	options: Options = {},
): Promise<RewardsResult<RewardsOrder | null>> {
	const result = await request<{ order?: RawOrder | null }>(REWARDS_ORDER_QUERY, { id }, options);
	if (!result.ok) return result;
	return { ok: true, value: toRewardsOrder(result.value.order) };
}

/** A lot, with its stored code when it was asked for. */
export type LotWithCode = TokenLot & { code: string | null };

type RawLot = {
	id?: string;
	isActive?: boolean;
	expiryDate?: string | null;
	created?: string;
	currentBalance?: Money;
	initialBalance?: Money;
	orderId?: string | null;
	code?: string | null;
};

export function toLot(raw: RawLot | null | undefined): LotWithCode | null {
	if (!raw?.id || !raw.created || !raw.currentBalance?.currency) return null;
	return {
		id: raw.id,
		currency: raw.currentBalance.currency.toUpperCase(),
		balanceCents: toCents(raw.currentBalance.amount),
		initialCents: toCents(raw.initialBalance?.amount ?? raw.currentBalance.amount),
		expiryDate: raw.expiryDate ?? null,
		createdAt: raw.created,
		isActive: raw.isActive !== false,
		orderId: raw.orderId ?? null,
		code: raw.code ?? null,
	};
}

type LotsPage = {
	giftCards?: {
		edges?: Array<{ node?: RawLot | null }>;
		pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
	} | null;
};

/** Safety valve: never page through more than this many pages (100 lots each) for one customer. */
const MAX_PAGES = 10;

/** Every token lot assigned to a customer (spent and expired ones included, so history can be shown). */
export async function listLots(
	userId: string,
	options: Options & { withCode?: boolean } = {},
): Promise<RewardsResult<LotWithCode[]>> {
	const found: LotWithCode[] = [];
	let after: string | null = null;
	for (let page = 0; page < MAX_PAGES; page += 1) {
		const result: RewardsResult<LotsPage> = await request<LotsPage>(
			LOTS_QUERY,
			{ assignedTo: [userId], after, withCode: options.withCode ?? false },
			options,
		);
		if (!result.ok) return result;
		const connection: LotsPage["giftCards"] = result.value.giftCards;
		for (const edge of connection?.edges ?? []) {
			const lot = toLot(edge.node);
			if (lot) found.push(lot);
		}
		if (!connection?.pageInfo?.hasNextPage || !connection.pageInfo.endCursor) break;
		after = connection.pageInfo.endCursor;
	}
	return { ok: true, value: found };
}

/** The lot(s) earned by an order. */
export async function findLotsByOrder(
	orderId: string,
	options: Options = {},
): Promise<RewardsResult<LotWithCode[]>> {
	const result = await request<LotsPage>(LOT_BY_ORDER_QUERY, { orderId, withCode: true }, options);
	if (!result.ok) return result;
	const lots = (result.value.giftCards?.edges ?? []).flatMap((edge) => {
		const lot = toLot(edge.node);
		return lot ? [lot] : [];
	});
	return { ok: true, value: lots };
}

type Errors = { errors?: Array<{ message?: string | null; code?: string | null }> } | null;
const firstError = (...payloads: Array<Errors | undefined>): string | null => {
	for (const payload of payloads) {
		const error = payload?.errors?.[0];
		if (error) return error.message ?? error.code ?? "Saleor rejected the change.";
	}
	return null;
};

export type NewLot = {
	/** How many tokens it holds. */
	tokens: number;
	currency: string;
	/** `YYYY-MM-DD`, or null for a lot that never expires. */
	expiryDate: string | null;
	userId: string;
	orderId: string;
	orderNumber: string;
};

/**
 * Creates a customer's lot: a gift card restricted to them, tagged, and marked with the order that earned it. Deliberately
 * given no `userEmail`: that would make Saleor email the customer a gift-card code, which tokens must never have.
 */
export async function createLot(
	lot: NewLot,
	options: Options = {},
): Promise<RewardsResult<{ id: string; code: string | null }>> {
	const result = await request<{
		giftCardCreate?:
			| ({ giftCard?: { id?: string; code?: string | null } | null } & NonNullable<Errors>)
			| null;
	}>(
		CREATE_LOT_MUTATION,
		{
			input: {
				balance: { amount: centsForTokens(lot.tokens) / 100, currency: lot.currency },
				isActive: true,
				...(lot.expiryDate ? { expiryDate: lot.expiryDate } : {}),
				addTags: [TOKEN_TAG],
				assignedTo: lot.userId,
				note: `Vapor Tokens earned on order #${lot.orderNumber}`,
				metadata: [
					{ key: LOT_ORDER_KEY, value: lot.orderId },
					{ key: LOT_TOKENS_KEY, value: String(lot.tokens) },
				],
			},
		},
		options,
	);
	if (!result.ok) return result;
	const payload = result.value.giftCardCreate;
	const error = firstError(payload);
	if (error) return { ok: false, message: error };
	if (!payload?.giftCard?.id) return { ok: false, message: "Saleor didn't return the new lot." };
	return { ok: true, value: { id: payload.giftCard.id, code: payload.giftCard.code ?? null } };
}

/** Saleor's own code for a lot that hasn't been used yet. Null when Saleor won't show it (the lot has been used). */
export async function readLotCode(id: string, options: Options = {}): Promise<RewardsResult<string | null>> {
	const result = await request<{ giftCard?: { code?: string | null } | null }>(
		LOT_CODE_QUERY,
		{ id },
		options,
	);
	if (!result.ok) return result;
	return { ok: true, value: result.value.giftCard?.code ?? null };
}

async function updatePrivateMetadata(
	id: string,
	entries: Array<{ key: string; value: string }>,
	options: Options,
): Promise<RewardsResult<true>> {
	const result = await request<{ updatePrivateMetadata?: Errors }>(
		STORE_METADATA_MUTATION,
		{ id, input: entries },
		options,
	);
	if (!result.ok) return result;
	const error = firstError(result.value.updatePrivateMetadata);
	return error ? { ok: false, message: error } : { ok: true, value: true };
}

/** Keeps a lot's code where we can read it after Saleor stops showing it (once the lot has been used). */
export const storeLotCode = (id: string, code: string, options: Options = {}) =>
	updatePrivateMetadata(id, [{ key: LOT_CODE_KEY, value: code }], options);

/** Records that an order's spending has been given back to this lot, so a repeat event does nothing. */
export const markRestored = (id: string, orderNumber: string, options: Options = {}) =>
	updatePrivateMetadata(id, [{ key: `${LOT_RESTORED_PREFIX}${orderNumber}`, value: "1" }], options);

export async function deactivateLot(id: string, options: Options = {}): Promise<RewardsResult<true>> {
	const result = await request<{ giftCardDeactivate?: Errors }>(DEACTIVATE_LOT_MUTATION, { id }, options);
	if (!result.ok) return result;
	const error = firstError(result.value.giftCardDeactivate);
	return error ? { ok: false, message: error } : { ok: true, value: true };
}

/** Changes a lot's balance by `deltaCents` (negative takes tokens away). */
export async function adjustLot(
	id: string,
	deltaCents: number,
	options: Options = {},
): Promise<RewardsResult<true>> {
	const result = await request<{ giftCardBalanceAdjust?: Errors }>(
		ADJUST_LOT_MUTATION,
		{ id, amount: deltaCents / 100 },
		options,
	);
	if (!result.ok) return result;
	const error = firstError(result.value.giftCardBalanceAdjust);
	return error ? { ok: false, message: error } : { ok: true, value: true };
}

/** What an order took from one lot, read from the lot's own history. */
export type LotUsage = {
	lotId: string;
	currency: string;
	/** Cents this order took from the lot. */
	usedCents: number;
	/** Whether this order's spending has already been given back to the lot. */
	restored: boolean;
};

type RawUsageLot = {
	id?: string;
	currentBalance?: Money;
	privateMetadata?: Array<{ key?: string; value?: string }> | null;
	events?: Array<{
		type?: string;
		orderId?: string | null;
		balance?: { currentBalance?: { amount?: number }; oldCurrentBalance?: { amount?: number } | null } | null;
	}> | null;
};

/** Pure: how much `orderId` took from each of these lots. Exported for tests. */
export function usageForOrder(
	lots: readonly RawUsageLot[],
	orderId: string,
	orderNumber: string,
): LotUsage[] {
	const usages: LotUsage[] = [];
	for (const lot of lots) {
		if (!lot.id) continue;
		let usedCents = 0;
		for (const event of lot.events ?? []) {
			if (event.type !== "USED_IN_ORDER" || event.orderId !== orderId) continue;
			const before = event.balance?.oldCurrentBalance?.amount;
			const after = event.balance?.currentBalance?.amount;
			if (typeof before === "number" && typeof after === "number")
				usedCents += toCents(before) - toCents(after);
		}
		if (usedCents <= 0) continue;
		usages.push({
			lotId: lot.id,
			currency: lot.currentBalance?.currency?.toUpperCase() ?? "",
			usedCents,
			restored: (lot.privateMetadata ?? []).some(
				(entry) => entry.key === `${LOT_RESTORED_PREFIX}${orderNumber}`,
			),
		});
	}
	return usages;
}

type UsagePage = {
	giftCards?: {
		edges?: Array<{ node?: RawUsageLot | null }>;
		pageInfo?: { hasNextPage?: boolean; endCursor?: string | null };
	} | null;
};

/** Which of a customer's lots an order spent from, and how much. */
export async function listUsageForOrder(
	userId: string,
	orderId: string,
	orderNumber: string,
	options: Options = {},
): Promise<RewardsResult<LotUsage[]>> {
	const lots: RawUsageLot[] = [];
	let after: string | null = null;
	for (let page = 0; page < MAX_PAGES; page += 1) {
		const result: RewardsResult<UsagePage> = await request<UsagePage>(
			LOT_USAGE_QUERY,
			{ assignedTo: [userId], after },
			options,
		);
		if (!result.ok) return result;
		const connection: UsagePage["giftCards"] = result.value.giftCards;
		for (const edge of connection?.edges ?? []) if (edge.node) lots.push(edge.node);
		if (!connection?.pageInfo?.hasNextPage || !connection.pageInfo.endCursor) break;
		after = connection.pageInfo.endCursor;
	}
	return { ok: true, value: usageForOrder(lots, orderId, orderNumber) };
}

/** A note on the order, visible to staff in the Dashboard. */
export async function addRewardsOrderNote(
	orderId: string,
	message: string,
	options: Options = {},
): Promise<RewardsResult<true>> {
	const result = await request<{ orderNoteAdd?: Errors }>(
		ORDER_NOTE_MUTATION,
		{ id: orderId, message },
		options,
	);
	if (!result.ok) return result;
	const error = firstError(result.value.orderNoteAdd);
	return error ? { ok: false, message: error } : { ok: true, value: true };
}
