import { createHash } from "node:crypto";
import { monthOf, type Ledger } from "./ledger";
import type { OrderStamp } from "./records";

/**
 * The numbers the AI reviewer looks at for one affiliate, worked out here from their orders so that **no names, emails or
 * addresses ever leave the store**: only counts, shares and the affiliate's code. Pure, so it's tested on its own.
 *
 * A referred order is any order that carried the affiliate's code from their link (credited or not) or was credited to
 * them through a linked discount code.
 */

export type ReferredOrder = {
	id: string;
	createdAt: string;
	status: string;
	buyerEmail: string | null;
	postalCode: string | null;
	voucherCode: string | null;
	/** The credit, when the order was credited to this affiliate. */
	stamp: OrderStamp | null;
};

export type AffiliateSignals = {
	code: string;
	tierThisMonth: string;
	/** Over the last 90 days. */
	referredOrders: number;
	creditedOrders: number;
	reversedOrders: number;
	/** Reversed ÷ credited (0–1). */
	reversalRate: number;
	/** Orders that carried the code but weren't credited (their own order, not approved, nothing to earn). */
	uncreditedOrders: number;
	/** Orders whose buyer used the affiliate's own email. */
	ownEmailOrders: number;
	/** Credited orders whose buyer's email looks like the affiliate's (same name before the @, or one contains the other). */
	lookalikeEmailOrders: number;
	/** The largest share of referred orders shipped to one postal code (0–1), when there are at least 3. */
	topPostalCodeShare: number;
	/** The largest share of referred orders from one buyer (0–1), when there are at least 3. */
	topBuyerShare: number;
	/** Credited through a linked discount code rather than the link (0–1). */
	discountCodeShare: number;
	/** Referred sales this month and the average of the three months before, in dollars at face value. */
	salesThisMonth: number;
	averagePreviousMonths: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const localPart = (email: string | null) => (email ?? "").trim().toLowerCase().split("@")[0] ?? "";
const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 16);

function topShare(values: readonly string[]): number {
	if (values.length < 3) return 0;
	const counts = new Map<string, number>();
	for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
	return Math.max(...counts.values()) / values.length;
}

const round = (n: number) => Math.round(n * 100) / 100;

export function computeSignals(
	code: string,
	affiliateEmail: string,
	orders: readonly ReferredOrder[],
	ledger: Ledger,
	now: Date,
): AffiliateSignals {
	const since = now.getTime() - 90 * DAY_MS;
	const recent = orders.filter((o) => Date.parse(o.createdAt) >= since);
	const credited = recent.filter((o) => o.stamp);
	const reversed = credited.filter((o) => o.stamp?.state === "reversed");
	const own = localPart(affiliateEmail);
	const ownEmail = affiliateEmail.trim().toLowerCase();

	const lookalike = credited.filter((o) => {
		const buyer = localPart(o.buyerEmail);
		if (!buyer || !own || o.buyerEmail?.trim().toLowerCase() === ownEmail) return false;
		const base = (s: string) => s.replace(/\+.*$/, "").replace(/[._-]/g, "");
		const a = base(buyer);
		const b = base(own);
		return a.length >= 4 && b.length >= 4 && (a === b || a.includes(b) || b.includes(a));
	});

	const thisMonth = monthOf(now);
	const previous = ledger.months.filter((m) => m.month < thisMonth).slice(0, 3);
	const averagePrevious = previous.length
		? previous.reduce((sum, m) => sum + m.volumeCents, 0) / previous.length / 100
		: 0;

	return {
		code,
		tierThisMonth: ledger.thisMonth.tier.name,
		referredOrders: recent.length,
		creditedOrders: credited.length,
		reversedOrders: reversed.length,
		reversalRate: credited.length ? round(reversed.length / credited.length) : 0,
		uncreditedOrders: recent.length - credited.length,
		ownEmailOrders: recent.filter((o) => o.buyerEmail?.trim().toLowerCase() === ownEmail).length,
		lookalikeEmailOrders: lookalike.length,
		// Compared as fingerprints, so even in memory here the review never needs the values themselves.
		topPostalCodeShare: round(
			topShare(
				recent
					.filter((o) => o.postalCode)
					.map((o) => fingerprint(o.postalCode!.replace(/\s+/g, "").toUpperCase())),
			),
		),
		topBuyerShare: round(
			topShare(
				recent.filter((o) => o.buyerEmail).map((o) => fingerprint(o.buyerEmail!.trim().toLowerCase())),
			),
		),
		discountCodeShare: credited.length
			? round(credited.filter((o) => o.stamp?.via === "voucher").length / credited.length)
			: 0,
		salesThisMonth: round(ledger.thisMonth.volumeCents / 100),
		averagePreviousMonths: round(averagePrevious),
	};
}
