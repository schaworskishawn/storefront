/**
 * The affiliate program's commission tiers: the one place their rates, monthly sales thresholds, payout schedules and
 * benefits live. The program page shows them and the ledger (ledger.ts) pays by them, so the two can't drift.
 *
 * A tier is earned by the affiliate's referred sales in a calendar month, and its rate applies to every sale that month:
 * crossing $1,000 lifts the whole month to 12%. Each tier keeps every benefit of the tier below and lists only what it adds.
 */

export type TierId = "cloud" | "vapor" | "surge" | "global";

/** How often an affiliate in the tier is paid: monthly on the 1st, every other Monday, or every Monday. */
export type PayoutSchedule = "monthly" | "biweekly" | "weekly";

export type AffiliateTier = {
	id: TierId;
	name: "CLOUD" | "VAPOR" | "SURGE" | "GLOBAL";
	/** Commission in basis points (1000 = 10%). */
	rateBps: number;
	/** The tier applies once a month's referred sales are *more than* this (in cents); Cloud from the first cent. */
	aboveCents: number;
	schedule: PayoutSchedule;
	/** What the tier adds to the one below (Cloud: the base benefits). */
	adds: readonly string[];
};

export const AFFILIATE_TIERS: readonly AffiliateTier[] = [
	{
		id: "cloud",
		name: "CLOUD",
		rateBps: 1000,
		aboveCents: 0,
		schedule: "monthly",
		adds: ["Basic marketing banners", "Monthly payouts", "Email support", "30-day cookie life"],
	},
	{
		id: "vapor",
		name: "VAPOR",
		rateBps: 1200,
		aboveCents: 100_000,
		schedule: "monthly",
		adds: ["Custom social templates", "Early access to select drops", "Co-branded landing page"],
	},
	{
		id: "surge",
		name: "SURGE",
		rateBps: 1500,
		aboveCents: 500_000,
		schedule: "biweekly",
		adds: [
			"Bi-weekly payouts",
			"Dedicated account manager",
			"Exclusive product samples",
			"Custom discount codes",
		],
	},
	{
		id: "global",
		name: "GLOBAL",
		rateBps: 2000,
		aboveCents: 1_500_000,
		schedule: "weekly",
		adds: ["Weekly payouts", "Highest commission rate", "Sponsorship & merch kit", "Direct Slack line"],
	},
];

/** Commission becomes payable this many days after an order is paid: the length of the return window. */
export const COMMISSION_HOLD_DAYS = 15;

/** A payout is only due once at least this much is owed in a currency (the page's "$50.00 minimum"). */
export const PAYOUT_MINIMUM_CENTS = 5_000;

/** How long a referral link is remembered. */
export const REFERRAL_COOKIE_DAYS = 30;

/** The tier a month's referred sales (in cents) earn. */
export function tierForVolume(cents: number): AffiliateTier {
	let tier = AFFILIATE_TIERS[0];
	for (const t of AFFILIATE_TIERS) if (cents > t.aboveCents) tier = t;
	return tier;
}

/** The tier above, or null at the top. */
export function nextTier(tier: AffiliateTier): AffiliateTier | null {
	const i = AFFILIATE_TIERS.findIndex((t) => t.id === tier.id);
	return AFFILIATE_TIERS[i + 1] ?? null;
}

export const tierById = (id: TierId): AffiliateTier =>
	AFFILIATE_TIERS.find((t) => t.id === id) ?? AFFILIATE_TIERS[0];

/** "10%". */
export const rateLabel = (tier: AffiliateTier): string => `${tier.rateBps / 100}%`;

const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US")}`;

/** "$0 - $1,000 / mo", "$1,001 - $5,000 / mo", …, "$15,001+ / mo". */
export function rangeLabel(tier: AffiliateTier): string {
	const above = nextTier(tier);
	const from = tier.aboveCents === 0 ? "$0" : dollars(tier.aboveCents + 100);
	return above ? `${from} - ${dollars(above.aboveCents)} / mo` : `${from}+ / mo`;
}

/**
 * Every benefit a tier includes: its own and all the tiers' below, with only the fastest payout schedule kept (Global's
 * weekly payouts replace Cloud's monthly ones).
 */
export function benefitsThrough(tier: AffiliateTier): string[] {
	const upTo = AFFILIATE_TIERS.slice(0, AFFILIATE_TIERS.findIndex((t) => t.id === tier.id) + 1);
	const all = upTo.flatMap((t) => t.adds);
	const payouts = all.filter((b) => / payouts$/.test(b));
	return all.filter((b) => !/ payouts$/.test(b) || b === payouts[payouts.length - 1]);
}

/** "Cloud", for sentences. */
export const tierTitle = (tier: AffiliateTier): string =>
	tier.name.charAt(0) + tier.name.slice(1).toLowerCase();

export const SCHEDULE_LABEL: Record<PayoutSchedule, string> = {
	monthly: "Monthly, on the 1st",
	biweekly: "Every other Monday",
	weekly: "Every Monday",
};
