import { earnBaseCents } from "@/lib/rewards/tokens";
import { normalizeAffiliateCode } from "./referral";
import { normalizeVoucher, type AffiliateRecord, type CreditVia, type OrderStamp } from "./records";

/**
 * Crediting orders to affiliates, run by the affiliates app's webhooks. Everything it touches comes in through `deps`, so
 * it's tested with fakes (engine.test.ts); run.ts wires it to Saleor and email.
 *
 * When an order is paid in full it is credited to an affiliate if it used a discount code linked to one, or else if it
 * carries a referral code from their link, as long as that affiliate is approved and it isn't their own order. The order
 * is stamped with what it earns on, once: the stamp is checked first, so Saleor re-sending the event changes nothing.
 * Cancelled and fully refunded orders are marked reversed and stop earning.
 */

export type Result<T> = { ok: true; value: T } | { ok: false; message: string };

export type AffiliateOrder = {
	id: string;
	number: string;
	status: string;
	userId: string | null;
	email: string | null;
	currency: string;
	chargedCents: number;
	shippingCents: number;
	taxCents: number;
	subtotalCents: number;
	voucherCode: string | null;
	/** The referral code the checkout copied from the cookie (unchecked). */
	ref: string | null;
	stamp: OrderStamp | null;
};

export type AffiliateAccount = { userId: string; email: string; name: string; record: AffiliateRecord };

export type AffiliateEngineDeps = {
	now: () => Date;
	orders: {
		get: (id: string) => Promise<Result<AffiliateOrder | null>>;
		stamp: (orderId: string, stamp: OrderStamp) => Promise<Result<void>>;
		note: (orderId: string, message: string) => Promise<Result<void>>;
	};
	/** Every customer with an affiliate record (any status). */
	affiliates: { list: () => Promise<Result<AffiliateAccount[]>> };
	alertStaff: (subject: string, text: string) => Promise<void>;
};

export type CreditOutcome =
	| "not-found"
	| "failed"
	| "stopped"
	| "already-credited"
	| "no-referral"
	| "unknown-affiliate"
	| "not-approved"
	| "self-referral"
	| "nothing-to-earn"
	| "credited";

const STOPPED_ORDER_STATUSES = new Set(["CANCELED", "EXPIRED"]);

const NOTE_PREFIX = "Affiliate: ";

const sameEmail = (a: string | null, b: string | null) =>
	!!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** Who an order should be credited to, if anyone: a linked discount code beats the referral link. */
export function findCredit(
	order: Pick<AffiliateOrder, "voucherCode" | "ref">,
	affiliates: readonly AffiliateAccount[],
): { account: AffiliateAccount; via: CreditVia } | { account: null; claimed: boolean } {
	if (order.voucherCode) {
		const voucher = normalizeVoucher(order.voucherCode);
		const account = affiliates.find((a) => a.record.code && a.record.vouchers.includes(voucher));
		if (account) return { account, via: "voucher" };
	}
	const ref = normalizeAffiliateCode(order.ref);
	if (ref) {
		// Only the private record counts: a customer can't claim a code by writing it in their own public metadata.
		const account = affiliates.find((a) => a.record.code === ref);
		if (account) return { account, via: "link" };
	}
	return { account: null, claimed: !!ref };
}

export async function creditOrder(orderId: string, deps: AffiliateEngineDeps): Promise<CreditOutcome> {
	const fetched = await deps.orders.get(orderId);
	if (!fetched.ok) {
		console.error(`[affiliates] couldn't read order ${orderId}: ${fetched.message}`);
		return "failed";
	}
	const order = fetched.value;
	if (!order) return "not-found";
	if (order.stamp) return "already-credited";
	if (STOPPED_ORDER_STATUSES.has(order.status)) return "stopped";
	if (!order.voucherCode && !normalizeAffiliateCode(order.ref)) return "no-referral";

	const listed = await deps.affiliates.list();
	if (!listed.ok) {
		await deps.alertStaff(
			`Affiliates: order ${order.number} couldn't be checked for a referral`,
			`Order ${order.number} may have come through an affiliate, but the affiliate list couldn't be read: ${listed.message}\n\nIt will be credited if Saleor re-sends the "order fully paid" event; otherwise check it by hand.`,
		);
		return "failed";
	}

	const credit = findCredit(order, listed.value);
	if (!credit.account) return credit.claimed ? "unknown-affiliate" : "no-referral";
	const { account, via } = credit;
	const code = account.record.code as string;

	if (account.record.status !== "approved") {
		await deps.orders.note(
			order.id,
			`${NOTE_PREFIX}not credited to ${code}, whose account is ${account.record.status}.`,
		);
		return "not-approved";
	}
	if ((order.userId && order.userId === account.userId) || sameEmail(order.email, account.email)) {
		await deps.orders.note(order.id, `${NOTE_PREFIX}not credited to ${code}: it's their own order.`);
		return "self-referral";
	}

	const baseCents = earnBaseCents(order);
	if (baseCents <= 0) return "nothing-to-earn";

	const stamp: OrderStamp = {
		code,
		affiliateId: account.userId,
		via,
		baseCents,
		currency: order.currency,
		paidAt: deps.now().toISOString(),
		state: "earned",
	};
	const stamped = await deps.orders.stamp(order.id, stamp);
	if (!stamped.ok) {
		await deps.alertStaff(
			`Affiliates: order ${order.number} couldn't be credited to ${code}`,
			`Order ${order.number} came through affiliate ${code} (${via === "voucher" ? `discount code ${order.voucherCode}` : "referral link"}), but Saleor refused to record it: ${stamped.message}\n\nIt will be retried if Saleor re-sends the event; otherwise add it by hand.`,
		);
		return "failed";
	}
	const how =
		via === "voucher" ? `discount code ${normalizeVoucher(order.voucherCode ?? "")}` : "referral link";
	await deps.orders.note(
		order.id,
		`${NOTE_PREFIX}credited to ${code} (${how}) on ${(baseCents / 100).toFixed(2)} ${order.currency} of products.`,
	);
	return "credited";
}

export type ReverseOutcome = "not-found" | "failed" | "not-credited" | "already-reversed" | "reversed";

export async function reverseOrder(orderId: string, deps: AffiliateEngineDeps): Promise<ReverseOutcome> {
	const fetched = await deps.orders.get(orderId);
	if (!fetched.ok) {
		console.error(`[affiliates] couldn't read order ${orderId}: ${fetched.message}`);
		return "failed";
	}
	const order = fetched.value;
	if (!order) return "not-found";
	if (!order.stamp) return "not-credited";
	if (order.stamp.state === "reversed") return "already-reversed";

	const stamp: OrderStamp = { ...order.stamp, state: "reversed", reversedAt: deps.now().toISOString() };
	const saved = await deps.orders.stamp(order.id, stamp);
	if (!saved.ok) {
		await deps.alertStaff(
			`Affiliates: order ${order.number}'s commission couldn't be taken back`,
			`Order ${order.number} was cancelled or refunded, but its credit to affiliate ${order.stamp.code} couldn't be marked reversed: ${saved.message}\n\nUntil it is, the commission still counts. Retry, or adjust the next payout by hand.`,
		);
		return "failed";
	}
	await deps.orders.note(
		order.id,
		`${NOTE_PREFIX}commission for ${order.stamp.code} reversed (order cancelled or refunded).`,
	);
	return "reversed";
}
