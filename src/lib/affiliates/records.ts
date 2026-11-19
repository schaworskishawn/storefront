import { normalizeAffiliateCode, normalizeCampaign } from "./referral";

/**
 * What the affiliate program keeps in Saleor, and how it reads it back. Everything lives in metadata, so there is no
 * separate database and the owner can see it all in the Dashboard.
 *
 * - On the affiliate's customer account: the record (`AffiliateRecord`) in *private* metadata, which only staff and the
 *   affiliates app can read or write, so it's the one that counts. A copy of the status and code goes in *public*
 *   metadata purely so Saleor can find affiliates (it can only filter on public metadata); customers can edit their own
 *   public metadata, so those copies are never trusted: every lookup is checked against the private record.
 * - On an order: the referral code from the cookie (public, copied from the checkout), and once the order is paid and
 *   credited, the stamp (`OrderStamp`, private) plus the credited code (public, written by the app, for finding an
 *   affiliate's orders).
 */
export const AFFILIATE_KEYS = {
	/** Customer, private: the record, as JSON. */
	record: "wv_aff.record",
	/** Customer, public: copies for lookups only. */
	indexStatus: "wv_aff.status",
	indexCode: "wv_aff.code",
	/** Checkout and order, public: the code from the referral cookie (a claim, not yet checked). */
	ref: "wv_aff.ref",
	/** Checkout and order, public: the campaign tag from the referral link (`&sub=`), if it had one. */
	campaign: "wv_aff.sub",
	/** Order, public: the affiliate the order was credited to (written by the app). */
	orderCode: "wv_aff.code",
	/** Order, private: the credit, as JSON. */
	orderStamp: "wv_aff.stamp",
} as const;

export type AffiliateStatus = "pending" | "approved" | "paused" | "rejected";

export type AffiliateApplication = {
	name: string;
	email: string;
	phone: string;
	country: string;
	platform: string;
	profileUrl: string;
	audience: string;
	plan: string;
};

/** The coins affiliates can be paid in through NOWPayments: dollar stablecoins on cheap networks. */
export const CRYPTO_COINS = {
	usdttrc20: { label: "USDT (TRON)", network: "TRON" },
	usdcmatic: { label: "USDC (Polygon)", network: "Polygon" },
} as const;
export type CryptoCoin = keyof typeof CRYPTO_COINS;
export const isCryptoCoin = (v: unknown): v is CryptoCoin => typeof v === "string" && v in CRYPTO_COINS;

/** How an affiliate is paid. New affiliates start on Vapor Tokens, which the daily job pays automatically. */
export type PayoutMethod =
	| { kind: "tokens" }
	| { kind: "crypto"; currency: CryptoCoin; address: string; setAt: string }
	| { kind: "etransfer"; email: string };

export const DEFAULT_PAYOUT_METHOD: PayoutMethod = { kind: "tokens" };

/**
 * A payout: what it covered of what was owed in each currency (cents), how, and when. `kind` is absent on payouts the
 * owner recorded by hand before automatic payouts existed. A crypto payout counts as paid while NOWPayments processes it
 * and stops counting if NOWPayments reports it failed or rejected (`status: "failed"`), so the amount is owed again.
 */
export type Payout = {
	id: string;
	at: string;
	amounts: Record<string, number>;
	method: string;
	note?: string;
	kind?: "manual" | "tokens" | "crypto";
	/** Tokens: how many were credited, at what bonus, in which lots. */
	tokens?: number;
	bonusBps?: number;
	lotIds?: string[];
	/** Crypto: NOWPayments' batch and payout ids, where it was sent, and how it's going. */
	batchId?: string;
	payoutIds?: string[];
	coin?: CryptoCoin;
	/** How much of the coin was sent. */
	coinAmount?: number;
	address?: string;
	status?: "processing" | "finished" | "failed";
	/** Crypto: when the batch was released with the 2FA code. Until then NOWPayments holds it (and rejects it after an hour). */
	verifiedAt?: string;
};

/** The AI reviewer's read of an application: advice for the owner, never a decision. */
export type AiApplicationReview = {
	at: string;
	recommendation: "approve" | "review" | "reject";
	risk: "low" | "medium" | "high";
	reasons: string[];
};

/** The AI reviewer's latest weekly flag on an affiliate. */
export type AiFlag = { at: string; severity: "low" | "medium" | "high"; reason: string };

export type AffiliateRecord = {
	status: AffiliateStatus;
	/** The referral code, set when approved and never changed after (orders are found by it). */
	code: string | null;
	/** Saleor voucher codes the owner linked to this affiliate (uppercase); an order using one is credited to them. */
	vouchers: string[];
	application: AffiliateApplication | null;
	appliedAt: string | null;
	approvedAt: string | null;
	payouts: Payout[];
	payoutMethod: PayoutMethod;
	/** Automatic payouts wait for the owner while this is set (an AI high-severity flag, or the owner). Crediting goes on. */
	autoHold: { reason: string; at: string } | null;
	aiReview: AiApplicationReview | null;
	aiFlag: AiFlag | null;
};

/** How an order came to be credited: through the referral link, or a linked discount code. */
export type CreditVia = "link" | "voucher";

export type OrderStamp = {
	code: string;
	/** The affiliate's customer id. */
	affiliateId: string;
	via: CreditVia;
	/** The commission base: what was paid in money for products (no shipping, tax, gift cards or tokens). */
	baseCents: number;
	currency: string;
	/** When the order was credited (it was paid in full); the month and the hold period count from here. */
	paidAt: string;
	state: "earned" | "reversed";
	reversedAt?: string;
	/** The campaign tag the referral link carried, when the order was credited through that link. */
	campaign?: string;
};

const STATUSES: readonly AffiliateStatus[] = ["pending", "approved", "paused", "rejected"];

const str = (v: unknown, max = 500): string => (typeof v === "string" ? v.slice(0, max) : "");
const isoOrNull = (v: unknown): string | null =>
	typeof v === "string" && !Number.isNaN(Date.parse(v)) ? v : null;
const cents = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : 0);

function parseJson(raw: string | null | undefined): unknown {
	if (!raw) return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

/** A voucher code as Saleor compares it: trimmed and uppercase. */
export const normalizeVoucher = (v: string): string => v.trim().toUpperCase();

function parseApplication(v: unknown): AffiliateApplication | null {
	if (!v || typeof v !== "object") return null;
	const a = v as Record<string, unknown>;
	return {
		name: str(a.name, 120),
		email: str(a.email, 200),
		phone: str(a.phone, 40),
		country: str(a.country, 80),
		platform: str(a.platform, 60),
		profileUrl: str(a.profileUrl, 300),
		audience: str(a.audience, 60),
		plan: str(a.plan, 2000),
	};
}

function parsePayout(v: unknown): Payout | null {
	if (!v || typeof v !== "object") return null;
	const p = v as Record<string, unknown>;
	const at = isoOrNull(p.at);
	if (!at || typeof p.id !== "string") return null;
	const amounts: Record<string, number> = {};
	if (p.amounts && typeof p.amounts === "object") {
		for (const [currency, value] of Object.entries(p.amounts as Record<string, unknown>)) {
			if (/^[A-Z]{3}$/.test(currency) && cents(value) !== 0) amounts[currency] = cents(value);
		}
	}
	const kind = p.kind === "tokens" || p.kind === "crypto" || p.kind === "manual" ? p.kind : undefined;
	const status =
		p.status === "processing" || p.status === "finished" || p.status === "failed" ? p.status : undefined;
	const strings = (x: unknown) =>
		Array.isArray(x) ? x.filter((i): i is string => typeof i === "string").slice(0, 20) : undefined;
	return {
		id: p.id,
		at,
		amounts,
		method: str(p.method, 120),
		...(p.note ? { note: str(p.note, 500) } : {}),
		...(kind ? { kind } : {}),
		...(typeof p.tokens === "number" ? { tokens: Math.max(0, Math.round(p.tokens)) } : {}),
		...(typeof p.bonusBps === "number" ? { bonusBps: Math.max(0, Math.round(p.bonusBps)) } : {}),
		...(strings(p.lotIds) ? { lotIds: strings(p.lotIds) } : {}),
		...(typeof p.batchId === "string" ? { batchId: str(p.batchId, 100) } : {}),
		...(strings(p.payoutIds) ? { payoutIds: strings(p.payoutIds) } : {}),
		...(isCryptoCoin(p.coin) ? { coin: p.coin } : {}),
		...(typeof p.coinAmount === "number" && Number.isFinite(p.coinAmount)
			? { coinAmount: p.coinAmount }
			: {}),
		...(typeof p.address === "string" ? { address: str(p.address, 120) } : {}),
		...(status ? { status } : {}),
		...(isoOrNull(p.verifiedAt) ? { verifiedAt: p.verifiedAt as string } : {}),
	};
}

function parsePayoutMethod(v: unknown): PayoutMethod {
	if (!v || typeof v !== "object") return DEFAULT_PAYOUT_METHOD;
	const m = v as Record<string, unknown>;
	if (m.kind === "crypto" && isCryptoCoin(m.currency) && typeof m.address === "string" && isoOrNull(m.setAt))
		return { kind: "crypto", currency: m.currency, address: str(m.address, 120), setAt: m.setAt as string };
	if (m.kind === "etransfer" && typeof m.email === "string")
		return { kind: "etransfer", email: str(m.email, 200) };
	return DEFAULT_PAYOUT_METHOD;
}

const oneOf = <T extends string>(v: unknown, options: readonly T[], fallback: T): T =>
	options.find((o) => o === v) ?? fallback;

function parseAiReview(v: unknown): AiApplicationReview | null {
	if (!v || typeof v !== "object") return null;
	const r = v as Record<string, unknown>;
	const at = isoOrNull(r.at);
	if (!at) return null;
	return {
		at,
		recommendation: oneOf(r.recommendation, ["approve", "review", "reject"] as const, "review"),
		risk: oneOf(r.risk, ["low", "medium", "high"] as const, "medium"),
		reasons: Array.isArray(r.reasons)
			? r.reasons
					.filter((x): x is string => typeof x === "string")
					.map((x) => x.slice(0, 300))
					.slice(0, 6)
			: [],
	};
}

function parseAiFlag(v: unknown): AiFlag | null {
	if (!v || typeof v !== "object") return null;
	const f = v as Record<string, unknown>;
	const at = isoOrNull(f.at);
	if (!at || typeof f.reason !== "string") return null;
	return {
		at,
		severity: oneOf(f.severity, ["low", "medium", "high"] as const, "low"),
		reason: str(f.reason, 500),
	};
}

function parseHold(v: unknown): { reason: string; at: string } | null {
	if (!v || typeof v !== "object") return null;
	const h = v as Record<string, unknown>;
	const at = isoOrNull(h.at);
	return at && typeof h.reason === "string" ? { reason: str(h.reason, 500), at } : null;
}

/** The record from a customer's private metadata, or null when they've never applied (or it's unreadable). */
export function parseAffiliateRecord(raw: string | null | undefined): AffiliateRecord | null {
	const v = parseJson(raw);
	if (!v || typeof v !== "object") return null;
	const r = v as Record<string, unknown>;
	const status = STATUSES.find((s) => s === r.status);
	if (!status) return null;
	return {
		status,
		code: normalizeAffiliateCode(r.code),
		vouchers: Array.isArray(r.vouchers)
			? [
					...new Set(r.vouchers.filter((x): x is string => typeof x === "string").map(normalizeVoucher)),
				].filter(Boolean)
			: [],
		application: parseApplication(r.application),
		appliedAt: isoOrNull(r.appliedAt),
		approvedAt: isoOrNull(r.approvedAt),
		payouts: Array.isArray(r.payouts) ? r.payouts.map(parsePayout).filter((p): p is Payout => !!p) : [],
		payoutMethod: parsePayoutMethod(r.payoutMethod),
		autoHold: parseHold(r.autoHold),
		aiReview: parseAiReview(r.aiReview),
		aiFlag: parseAiFlag(r.aiFlag),
	};
}

export const serializeAffiliateRecord = (record: AffiliateRecord): string => JSON.stringify(record);

/** An order's credit from its private metadata, or null when it wasn't credited (or it's unreadable). */
export function parseOrderStamp(raw: string | null | undefined): OrderStamp | null {
	const v = parseJson(raw);
	if (!v || typeof v !== "object") return null;
	const s = v as Record<string, unknown>;
	const code = normalizeAffiliateCode(s.code);
	const paidAt = isoOrNull(s.paidAt);
	if (!code || !paidAt || typeof s.affiliateId !== "string" || typeof s.currency !== "string") return null;
	return {
		code,
		affiliateId: s.affiliateId,
		via: s.via === "voucher" ? "voucher" : "link",
		baseCents: Math.max(0, cents(s.baseCents)),
		currency: s.currency,
		paidAt,
		state: s.state === "reversed" ? "reversed" : "earned",
		...(isoOrNull(s.reversedAt) ? { reversedAt: isoOrNull(s.reversedAt) as string } : {}),
		...(normalizeCampaign(s.campaign) ? { campaign: normalizeCampaign(s.campaign) as string } : {}),
	};
}

export const serializeOrderStamp = (stamp: OrderStamp): string => JSON.stringify(stamp);

/** A fresh application's record. */
export function newApplicationRecord(application: AffiliateApplication, now: Date): AffiliateRecord {
	return {
		status: "pending",
		code: null,
		vouchers: [],
		application,
		appliedAt: now.toISOString(),
		approvedAt: null,
		payouts: [],
		payoutMethod: DEFAULT_PAYOUT_METHOD,
		autoHold: null,
		aiReview: null,
		aiFlag: null,
	};
}
