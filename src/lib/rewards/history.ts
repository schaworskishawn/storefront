import { isUsable, type TokenLot } from "./lots";
import { tokensInCents } from "./tokens";

/**
 * A customer's token history for the account page: one row per order that earned tokens, newest first, with what is left of
 * it and why it can or can't be spent. Pure, so what the customer reads is unit-tested.
 */

export type LotStatus =
	/** Tokens left and not expired: spendable. */
	| "active"
	/** Past its expiry date with tokens left unspent. */
	| "expired"
	/** Fully spent. */
	| "used"
	/** Taken back, because the order that earned it was cancelled or refunded. */
	| "closed";

type LotRow = {
	id: string;
	currency: string;
	/** `YYYY-MM-DD`. */
	earnedOn: string;
	earnedTokens: number;
	remainingTokens: number;
	/** `YYYY-MM-DD`, or null if the tokens never expire. */
	expiryDate: string | null;
	status: LotStatus;
};

export function lotStatus(lot: TokenLot, now: Date): LotStatus {
	if (!lot.isActive) return "closed";
	if (lot.balanceCents <= 0) return "used";
	return isUsable(lot, now) ? "active" : "expired";
}

export function lotRows(lots: readonly TokenLot[], now: Date): LotRow[] {
	return [...lots]
		.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
		.map((lot) => ({
			id: lot.id,
			currency: lot.currency,
			earnedOn: lot.createdAt.slice(0, 10),
			earnedTokens: tokensInCents(lot.initialCents),
			remainingTokens: tokensInCents(lot.balanceCents),
			expiryDate: lot.expiryDate,
			status: lotStatus(lot, now),
		}));
}
