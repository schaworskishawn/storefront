import { addCalendarDays } from "./dates";
import { tokensInCents } from "./tokens";

/**
 * A customer's tokens are a set of "lots", one per order that earned them. These are the rules for reading them: which can
 * still be spent, what the balance is, what is about to expire, and which lots to put on a checkout. Pure, so they are
 * unit-tested without Saleor.
 */

export type TokenLot = {
	/** The Saleor gift card's id. */
	id: string;
	/** A lot can only be spent on a checkout in its own currency. */
	currency: string;
	balanceCents: number;
	initialCents: number;
	/** `YYYY-MM-DD`: the last day the lot can be used, or null if it never expires. */
	expiryDate: string | null;
	createdAt: string;
	isActive: boolean;
	/** Saleor id of the order that earned it. */
	orderId: string | null;
};

const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

/** Saleor treats a gift card as valid through its expiry date, so `expiryDate === today` is still usable. */
export function isUsable(lot: TokenLot, now: Date): boolean {
	return lot.isActive && lot.balanceCents > 0 && (lot.expiryDate === null || lot.expiryDate >= isoDay(now));
}

/** The order lots should be spent in: soonest to expire first, lots that never expire last, ties by age. */
const spendOrder = (a: TokenLot, b: TokenLot): number => {
	if (a.expiryDate !== b.expiryDate) {
		if (a.expiryDate === null) return 1;
		if (b.expiryDate === null) return -1;
		return a.expiryDate < b.expiryDate ? -1 : 1;
	}
	return a.createdAt.localeCompare(b.createdAt);
};

export function usableLots<L extends TokenLot>(lots: readonly L[], now: Date, currency: string): L[] {
	return lots.filter((lot) => lot.currency === currency.toUpperCase() && isUsable(lot, now)).sort(spendOrder);
}

type TokenBalance = { currency: string; tokens: number; cents: number };

/** What the customer can spend now, per currency. */
export function balances(lots: readonly TokenLot[], now: Date): TokenBalance[] {
	const byCurrency = new Map<string, number>();
	for (const lot of lots) {
		if (isUsable(lot, now))
			byCurrency.set(lot.currency, (byCurrency.get(lot.currency) ?? 0) + lot.balanceCents);
	}
	return [...byCurrency]
		.map(([currency, cents]) => ({ currency, cents, tokens: tokensInCents(cents) }))
		.sort((a, b) => a.currency.localeCompare(b.currency));
}

export const balanceFor = (lots: readonly TokenLot[], now: Date, currency: string): TokenBalance =>
	balances(lots, now).find((balance) => balance.currency === currency.toUpperCase()) ?? {
		currency: currency.toUpperCase(),
		tokens: 0,
		cents: 0,
	};

export type ExpiringSoon = { tokens: number; firstDate: string };

/** Tokens that will expire within `withinDays`, and the first such date. Null when nothing is about to expire. */
export function expiringSoon(
	lots: readonly TokenLot[],
	now: Date,
	currency: string,
	withinDays = 30,
): ExpiringSoon | null {
	const horizon = addCalendarDays(isoDay(now), withinDays);
	const soon = usableLots(lots, now, currency).filter(
		(lot) => lot.expiryDate !== null && lot.expiryDate <= horizon,
	);
	if (soon.length === 0) return null;
	return {
		tokens: tokensInCents(soon.reduce((sum, lot) => sum + lot.balanceCents, 0)),
		firstDate: soon[0].expiryDate as string,
	};
}

type Application<L extends TokenLot = TokenLot> = {
	/** The lots to put on the checkout, in the order to apply them. */
	lots: L[];
	/** The most they can take off: their combined balance, which may be more than the order needs. */
	coveredCents: number;
};

/**
 * Which lots to apply so the order is covered, soonest-expiring first. Only as many as needed: an order that two lots cover
 * doesn't get a third. Lots already on the checkout are skipped, so applying twice does nothing. `totalCents` is the
 * checkout's current total, which Saleor has already reduced by anything applied.
 */
export function planApplication<L extends TokenLot>(
	lots: readonly L[],
	now: Date,
	currency: string,
	totalCents: number,
	alreadyApplied: ReadonlySet<string> = new Set(),
): Application<L> {
	if (!(totalCents > 0)) return { lots: [], coveredCents: 0 };

	const chosen: L[] = [];
	let covered = 0;
	for (const lot of usableLots(lots, now, currency)) {
		if (alreadyApplied.has(lot.id)) continue;
		if (covered >= totalCents) break;
		chosen.push(lot);
		covered += lot.balanceCents;
	}
	return { lots: chosen, coveredCents: covered };
}
