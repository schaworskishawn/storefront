/**
 * Vapor Tokens: the store's loyalty points. A customer earns tokens when an order is paid in full and spends them at checkout
 * as money off. One token is worth one cent, so 100 tokens take $1.00 off.
 *
 * Each order's tokens are kept as one Saleor gift card (a "lot") tagged `vapor-tokens`, restricted to the customer and with
 * its own expiry. Saleor already knows how to expire, apply and spend a gift card, so tokens need no ledger of their own.
 *
 * Pure and client-safe (no server imports): the checkout uses it to show what an order will earn, the webhook to work out
 * what to award. Money is handled in whole cents.
 */

/** One token is worth this many cents. Changing it changes what every existing token is worth, so it is not a setting. */
const TOKEN_VALUE_CENTS = 1;

/** Every token lot carries this gift-card tag, which is how the app finds a customer's tokens. */
export const TOKEN_TAG = "vapor-tokens";

/** Public metadata on a lot: the Saleor id of the order that earned it. Finding the lot by it makes awarding idempotent. */
export const LOT_ORDER_KEY = "paper.vt.order";
/** Public metadata on a lot: how many tokens it started with. */
export const LOT_TOKENS_KEY = "paper.vt.tokens";
/**
 * Private metadata on a lot: its gift-card code. Saleor stops showing a code to staff once a card has been used, but spending
 * a partly used lot needs the code, so it is kept here at creation (while Saleor still shows it).
 */
export const LOT_CODE_KEY = "paper.vt.code";
/** Private metadata on a lot: set to "1" once this order's spending has been given back, so a repeat does nothing. */
export const LOT_RESTORED_PREFIX = "paper.vt.restored.";

export const DEFAULT_TOKENS_PER_DOLLAR = 3;
export const DEFAULT_EXPIRY_MONTHS = 12;

export type RewardsConfig = {
	enabled: boolean;
	/** Tokens earned per $1 of products paid for. */
	tokensPerDollar: number;
	/** Months until a lot expires; 0 means it never does. */
	expiryMonths: number;
};

type PublicEnv = { enabled?: string; tokensPerDollar?: string; expiryMonths?: string };

// Literal `process.env.NEXT_PUBLIC_…` reads, so Next inlines them into the browser bundle.
const publicEnv = (): PublicEnv => ({
	enabled: process.env.NEXT_PUBLIC_ENABLE_REWARDS,
	tokensPerDollar: process.env.NEXT_PUBLIC_REWARDS_TOKENS_PER_DOLLAR,
	expiryMonths: process.env.NEXT_PUBLIC_REWARDS_EXPIRY_MONTHS,
});

const positive = (value: string | undefined, fallback: number): number => {
	const parsed = Number.parseFloat(value ?? "");
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const wholeMonths = (value: string | undefined, fallback: number): number => {
	const parsed = Number.parseInt(value ?? "", 10);
	return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

export function readRewardsConfig(env: PublicEnv = publicEnv()): RewardsConfig {
	return {
		enabled: env.enabled === "true",
		tokensPerDollar: positive(env.tokensPerDollar, DEFAULT_TOKENS_PER_DOLLAR),
		expiryMonths: wholeMonths(env.expiryMonths, DEFAULT_EXPIRY_MONTHS),
	};
}

/** Tokens earned for spending `cents` at `tokensPerDollar`, rounded down: a part-token is never awarded. */
export function tokensForCents(cents: number, tokensPerDollar: number): number {
	if (!Number.isFinite(cents) || cents <= 0 || !(tokensPerDollar > 0)) return 0;
	// The small epsilon keeps 0.1 + 0.2 style float noise from rounding a whole token down.
	return Math.floor((cents * tokensPerDollar) / 100 + 1e-9);
}

export const centsForTokens = (tokens: number): number => tokens * TOKEN_VALUE_CENTS;

/** Whole tokens in an amount of cents (a part-token doesn't count). */
export const tokensInCents = (cents: number): number => Math.floor(cents / TOKEN_VALUE_CENTS);

type EarnInput = {
	/** What the customer paid in real money (cards, e-Transfer, crypto); gift cards and tokens are not in here. */
	chargedCents: number;
	shippingCents: number;
	taxCents: number;
	/** The products' price: tokens never earn on more than this. */
	subtotalCents: number;
};

/**
 * The part of an order that earns tokens: what was paid in money, without shipping and tax, and never more than the
 * products cost. Paying part of an order with tokens therefore earns nothing on that part.
 */
export function earnBaseCents({ chargedCents, shippingCents, taxCents, subtotalCents }: EarnInput): number {
	const base = chargedCents - shippingCents - taxCents;
	return Math.max(0, Math.min(base, subtotalCents));
}

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * The date, `months` after `from` (UTC), as `YYYY-MM-DD` for a gift card's expiry; null for 0, meaning never. A day that
 * doesn't exist in the later month (31 January plus one month) lands on that month's last day.
 */
export function expiryDateFor(from: Date, months: number): string | null {
	if (months <= 0) return null;
	const year = from.getUTCFullYear();
	const month = from.getUTCMonth() + months;
	const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
	const target = new Date(Date.UTC(year, month, Math.min(from.getUTCDate(), lastDay)));
	return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(target.getUTCDate())}`;
}
