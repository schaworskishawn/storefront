import { formatCents, formatVolume, payoutSlots, type Ledger, type PayoutStatus } from "./ledger";
import { describePayoutMethod } from "./payout-prefs";
import type { PayoutMethod } from "./records";
import {
	AFFILIATE_TIERS,
	COMMISSION_HOLD_DAYS,
	PAYOUT_MINIMUM_CENTS,
	REFERRAL_COOKIE_DAYS,
	SCHEDULE_LABEL,
	TOKEN_BONUS_BPS,
	rateLabel,
	tierTitle,
} from "./tiers";

/**
 * What the affiliate program page's "Your affiliate dashboard" section shows, from real data only:
 *
 * - **An affiliate looking at it** sees their own numbers, from the same ledger as their dashboard: what they've earned,
 *   their referred orders, this month's sales and tier, what's still in the return window, and their next payout.
 * - **Everyone else** sees the program's actual terms (rates, cookie, return window, token bonus) and the real next payout
 *   date, read from the settings commission is paid by, never sample numbers.
 *
 * Pure, so both are tested on their own (live-stats.test.ts).
 */

export type LiveStatId = "earned" | "orders" | "month" | "pending" | "rate" | "cookie" | "hold" | "bonus";

export type LiveStat = {
	id: LiveStatId;
	label: string;
	value: string;
	note: string;
	/** Progress to the next tier this month (0–100), on the month's card. */
	progress?: { percent: number; label: string };
};

export type LiveView = {
	stats: LiveStat[];
	payout: { label: string; value: string; rows: Array<[string, string]> };
};

const DAY_MS = 24 * 60 * 60 * 1000;

const day = (at: string | number) =>
	new Date(at).toLocaleDateString("en-CA", {
		month: "short",
		day: "numeric",
		year: "numeric",
		timeZone: "UTC",
	});

/** "$12.50 USD + $3.00 CAD", leaving out empty currencies; "$0.00" when there's nothing at all. */
export function money(byCurrency: Record<string, number>): string {
	const parts = Object.entries(byCurrency)
		.filter(([, cents]) => cents !== 0)
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([currency, cents]) => formatCents(cents, currency));
	return parts.length > 0 ? parts.join(" + ") : formatVolume(0);
}

const perCurrency = (ledger: Ledger, pick: (t: Ledger["totals"][string]) => number) =>
	Object.fromEntries(Object.entries(ledger.totals).map(([currency, t]) => [currency, pick(t)]));

/** A signed-in affiliate's own numbers. */
export function affiliateLiveView(
	ledger: Ledger,
	payout: PayoutStatus,
	payoutMethod: PayoutMethod,
	now: Date,
): LiveView {
	const credited = ledger.lines.filter((l) => l.status !== "reversed");
	const { month, volumeCents, tier, next, toNextCents } = ledger.thisMonth;

	const thisMonth: Record<string, number> = {};
	for (const line of credited)
		if (line.month === month)
			thisMonth[line.currency] = (thisMonth[line.currency] ?? 0) + line.commissionCents;
	const thisWeek = credited.filter((l) => Date.parse(l.paidAt) >= now.getTime() - 7 * DAY_MS).length;
	const nextPayable = credited
		.filter((l) => l.status === "pending")
		.map((l) => l.payableAt)
		.sort()[0];

	const hasMonth = Object.values(thisMonth).some((c) => c > 0);
	return {
		stats: [
			{
				id: "earned",
				label: "TOTAL EARNED",
				value: money(perCurrency(ledger, (t) => t.pendingCents + t.payableCents)),
				note: hasMonth ? `+${money(thisMonth)} this month` : "Your first commission shows here",
			},
			{
				id: "orders",
				label: "REFERRED ORDERS",
				value: `${credited.length} ${credited.length === 1 ? "order" : "orders"}`,
				note: thisWeek > 0 ? `+${thisWeek} this week` : "None yet this week",
			},
			{
				id: "month",
				label: "THIS MONTH'S SALES",
				value: formatVolume(volumeCents),
				note:
					next && toNextCents !== null
						? `${tierTitle(tier)} ${rateLabel(tier)} · ${formatVolume(toNextCents)} more to ${tierTitle(next)} ${rateLabel(next)}`
						: `${tierTitle(tier)} ${rateLabel(tier)} · the top tier`,
				progress: {
					percent: next ? Math.min(100, (volumeCents / (next.aboveCents + 1)) * 100) : 100,
					label: next ? `Progress to ${tierTitle(next)}` : "Top tier reached",
				},
			},
			{
				id: "pending",
				label: "IN THE RETURN WINDOW",
				value: money(perCurrency(ledger, (t) => t.pendingCents)),
				note: nextPayable
					? `Payable from ${day(nextPayable)}`
					: `Commission is payable ${COMMISSION_HOLD_DAYS} days after each order`,
			},
		],
		payout: {
			label: "TO BE PAID",
			value: money(perCurrency(ledger, (t) => Math.max(0, t.owedCents))),
			rows: [
				["Next payout", payout.due.length > 0 ? "Due now" : day(payout.nextDate)],
				["Paid in", describePayoutMethod(payoutMethod)],
				["Schedule", SCHEDULE_LABEL[tier.schedule]],
				["Minimum", `${formatVolume(PAYOUT_MINIMUM_CENTS)} owed`],
			],
		},
	};
}

/** The program's real terms, for anyone who isn't an affiliate (yet). */
export function programLiveView(now: Date): LiveView {
	const first = AFFILIATE_TIERS[0]!;
	const top = AFFILIATE_TIERS[AFFILIATE_TIERS.length - 1]!;
	const bonus = `+${TOKEN_BONUS_BPS / 100}%`;
	return {
		stats: [
			{
				id: "rate",
				label: "COMMISSION",
				value: `${first.rateBps / 100}–${rateLabel(top)}`,
				note: "Set by each month's referred sales",
			},
			{
				id: "cookie",
				label: "COOKIE WINDOW",
				value: `${REFERRAL_COOKIE_DAYS} days`,
				note: "Orders after a click on your link count",
			},
			{
				id: "hold",
				label: "RETURN WINDOW",
				value: `${COMMISSION_HOLD_DAYS} days`,
				note: "Then your commission is payable",
			},
			{
				id: "bonus",
				label: "TOKEN BONUS",
				value: bonus,
				note: "On every payout taken in Vapor Tokens",
			},
		],
		payout: {
			label: "NEXT PAYOUT DATE",
			value: day(payoutSlots(first.schedule, now).next),
			rows: [
				["Schedule", `${SCHEDULE_LABEL[first.schedule]}; weekly at ${tierTitle(top)}`],
				["Paid in", `Vapor Tokens (${bonus}), USDT, USDC or e-Transfer`],
				["Minimum", `${formatVolume(PAYOUT_MINIMUM_CENTS)} owed`],
				["Tracking", "Every referred order, live"],
			],
		},
	};
}
