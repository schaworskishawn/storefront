import type { OrderStamp, Payout } from "./records";
import {
	COMMISSION_HOLD_DAYS,
	PAYOUT_MINIMUM_CENTS,
	nextTier,
	tierForVolume,
	type AffiliateTier,
	type PayoutSchedule,
	type TierId,
} from "./tiers";

/**
 * An affiliate's account, worked out from their credited orders and the payouts recorded so far. Pure: no clock, no I/O,
 * so every rule is tested on its own (ledger.test.ts).
 *
 * - A calendar month (UTC) of referred sales sets the month's tier, and its rate applies to every order credited that
 *   month. Sales in USD and CAD count at face value towards the tier; commission stays in the order's currency.
 * - An order's commission is pending for the hold period (15 days, the return window) after it was paid, then payable.
 *   A cancelled or refunded order earns nothing and stops counting towards its month.
 * - What's owed in a currency is everything payable less everything paid. It can go below zero when an order is reversed
 *   after its commission was paid out; the next payouts make that up.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type LedgerOrder = { orderId: string; number: string; stamp: OrderStamp };

export type CommissionLine = {
	orderId: string;
	number: string;
	month: string;
	paidAt: string;
	payableAt: string;
	via: OrderStamp["via"];
	currency: string;
	baseCents: number;
	tierId: TierId;
	rateBps: number;
	commissionCents: number;
	status: "pending" | "payable" | "reversed";
};

export type CurrencyTotals = {
	pendingCents: number;
	payableCents: number;
	paidCents: number;
	/** Payable less paid: what a payout should be now. Below zero when a paid order was later reversed. */
	owedCents: number;
};

export type Ledger = {
	/** Newest first. */
	lines: CommissionLine[];
	/** Each month with credited orders, newest first. */
	months: { month: string; volumeCents: number; tier: AffiliateTier }[];
	thisMonth: {
		month: string;
		volumeCents: number;
		tier: AffiliateTier;
		next: AffiliateTier | null;
		/** How much more this month reaches the next tier, or null at the top. */
		toNextCents: number | null;
	};
	/** Per currency, for every currency that has commission or payouts. */
	totals: Record<string, CurrencyTotals>;
	/** Newest first. */
	payouts: Payout[];
};

/** "2026-11" for a moment, in UTC. */
export const monthOf = (at: string | Date): string => new Date(at).toISOString().slice(0, 7);

const emptyTotals = (): CurrencyTotals => ({ pendingCents: 0, payableCents: 0, paidCents: 0, owedCents: 0 });

export function computeLedger(orders: readonly LedgerOrder[], payouts: readonly Payout[], now: Date): Ledger {
	const volume = new Map<string, number>();
	for (const { stamp } of orders) {
		if (stamp.state !== "earned") continue;
		const month = monthOf(stamp.paidAt);
		volume.set(month, (volume.get(month) ?? 0) + stamp.baseCents);
	}
	const tierOf = (month: string) => tierForVolume(volume.get(month) ?? 0);

	const totals: Record<string, CurrencyTotals> = {};
	const totalsFor = (currency: string) => (totals[currency] ??= emptyTotals());

	const lines: CommissionLine[] = orders.map(({ orderId, number, stamp }) => {
		const month = monthOf(stamp.paidAt);
		const tier = tierOf(month);
		const payableAt = new Date(Date.parse(stamp.paidAt) + COMMISSION_HOLD_DAYS * DAY_MS).toISOString();
		const reversed = stamp.state === "reversed";
		const commissionCents = reversed ? 0 : Math.round((stamp.baseCents * tier.rateBps) / 10_000);
		const status = reversed ? "reversed" : now.getTime() >= Date.parse(payableAt) ? "payable" : "pending";
		const t = totalsFor(stamp.currency);
		if (status === "pending") t.pendingCents += commissionCents;
		if (status === "payable") t.payableCents += commissionCents;
		return {
			orderId,
			number,
			month,
			paidAt: stamp.paidAt,
			payableAt,
			via: stamp.via,
			currency: stamp.currency,
			baseCents: stamp.baseCents,
			tierId: tier.id,
			rateBps: tier.rateBps,
			commissionCents,
			status,
		};
	});

	for (const payout of payouts) {
		for (const [currency, cents] of Object.entries(payout.amounts)) totalsFor(currency).paidCents += cents;
	}
	for (const t of Object.values(totals)) t.owedCents = t.payableCents - t.paidCents;

	const month = monthOf(now);
	const monthVolume = volume.get(month) ?? 0;
	const tier = tierForVolume(monthVolume);
	const next = nextTier(tier);

	return {
		lines: lines.sort((a, b) => b.paidAt.localeCompare(a.paidAt)),
		months: [...volume.entries()]
			.map(([m, cents]) => ({ month: m, volumeCents: cents, tier: tierForVolume(cents) }))
			.sort((a, b) => b.month.localeCompare(a.month)),
		thisMonth: {
			month,
			volumeCents: monthVolume,
			tier,
			next,
			toNextCents: next ? next.aboveCents - monthVolume + 1 : null,
		},
		totals,
		payouts: [...payouts].sort((a, b) => b.at.localeCompare(a.at)),
	};
}

/** Monday 5 January 2026 (UTC): the first of the every-other-Monday payout dates. */
const BIWEEKLY_ANCHOR = Date.UTC(2026, 0, 5);

const startOfDay = (t: number) => {
	const d = new Date(t);
	return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/** The latest payout date on or before `now`, and the one after it, for a schedule (UTC midnights). */
export function payoutSlots(schedule: PayoutSchedule, now: Date): { last: number; next: number } {
	const today = startOfDay(now.getTime());
	if (schedule === "monthly") {
		const d = new Date(today);
		return {
			last: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1),
			next: Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1),
		};
	}
	if (schedule === "weekly") {
		const sinceMonday = (new Date(today).getUTCDay() + 6) % 7;
		const last = today - sinceMonday * DAY_MS;
		return { last, next: last + 7 * DAY_MS };
	}
	const periods = Math.floor((today - BIWEEKLY_ANCHOR) / (14 * DAY_MS));
	const last = BIWEEKLY_ANCHOR + periods * 14 * DAY_MS;
	return { last, next: last + 14 * DAY_MS };
}

export type PayoutStatus = {
	/** Currencies whose owed amount should be paid now, with the amount. Empty when nothing is due. */
	due: { currency: string; cents: number }[];
	/** When the next payout falls: a date already passed while something is due, otherwise the next scheduled date. */
	nextDate: string;
};

/**
 * Whether a payout is due. One is due in a currency once a payout date has passed since the last payout (or since
 * approval) and at least the minimum is owed in it. Below the minimum it simply waits for a later date.
 */
export function payoutStatus(
	ledger: Ledger,
	schedule: PayoutSchedule,
	since: string | null,
	now: Date,
): PayoutStatus {
	const { last, next } = payoutSlots(schedule, now);
	const sinceMs = since ? Date.parse(since) : 0;
	const datePassed = last > sinceMs;
	const due = datePassed
		? Object.entries(ledger.totals)
				.filter(([, t]) => t.owedCents >= PAYOUT_MINIMUM_CENTS)
				.map(([currency, t]) => ({ currency, cents: t.owedCents }))
		: [];
	return { due, nextDate: new Date(due.length ? last : next).toISOString() };
}

/** When the affiliate was last paid, or approved if never: what the payout schedule counts from. */
export const payoutsSince = (payouts: readonly Payout[], approvedAt: string | null): string | null =>
	payouts.reduce<string | null>((latest, p) => (!latest || p.at > latest ? p.at : latest), null) ??
	approvedAt;

/** "$12.50 USD". */
export function formatCents(cents: number, currency: string): string {
	const amount = (cents / 100).toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
	return `${cents < 0 ? "-" : ""}$${amount.replace("-", "")} ${currency}`;
}

/** Sales volume across currencies, as the tiers count it: "$1,234.00". */
export const formatVolume = (cents: number): string =>
	`$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
