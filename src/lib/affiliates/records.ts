import { normalizeAffiliateCode } from "./referral";

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

/** A payout the owner made and recorded: what was paid in each currency (cents), how, and when. */
export type Payout = {
	id: string;
	at: string;
	amounts: Record<string, number>;
	method: string;
	note?: string;
};

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
	return { id: p.id, at, amounts, method: str(p.method, 120), ...(p.note ? { note: str(p.note, 500) } : {}) };
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
	};
}
