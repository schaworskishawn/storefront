import { centsForTokens, tokensForCents, type RewardsConfig } from "./tokens";

/**
 * The shopper-facing description of the Vapor Tokens program, worded from the live settings so a page never promises a
 * rate or expiry the store isn't actually using. Pure and client-safe.
 */

type ProgramNumbers = Pick<RewardsConfig, "tokensPerDollar" | "expiryMonths">;

/** The earn rate as shown to a shopper: "3", "2.5", never float noise like "0.30000000000000004". */
export function formatRate(tokensPerDollar: number): string {
	return Number.isInteger(tokensPerDollar)
		? String(tokensPerDollar)
		: String(Math.round(tokensPerDollar * 100) / 100);
}

/** "1 token", "3 tokens", "2.5 tokens". */
export const tokenCount = (count: number): string =>
	`${formatRate(count)} ${count === 1 ? "token" : "tokens"}`;

/** An amount of cents as a shopper reads it in copy: "$1", "$5", "$0.50", "$1.25". */
export function formatDollars(cents: number): string {
	return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

/** What 100 tokens take off an order, e.g. "$1": the program's headline exchange rate, worded from the token's value. */
export const hundredTokensWorth = (): string => formatDollars(centsForTokens(100));

/** When tokens expire, in the two shapes the pages need: a stat ("12 months", "Never") and a sentence. */
export function describeExpiry(expiryMonths: number): { short: string; sentence: string } {
	if (expiryMonths <= 0) return { short: "Never", sentence: "Tokens don't expire." };
	const months = `${expiryMonths} ${expiryMonths === 1 ? "month" : "months"}`;
	return { short: months, sentence: `Tokens expire ${months} after you earn them.` };
}

export function describeProgram(config: ProgramNumbers): string {
	return `Signed-in customers earn ${formatRate(config.tokensPerDollar)} Vapor ${config.tokensPerDollar === 1 ? "Token" : "Tokens"} for every $1 spent on products. Spend them at checkout: 100 tokens take ${hundredTokensWorth()} off your order. ${describeExpiry(config.expiryMonths).sentence}`;
}

/** What an order of `dollars` in products would earn, and what those tokens take off a later order. For the page's calculator. */
export function previewEarn(
	dollars: number,
	tokensPerDollar: number,
): { tokens: number; worthCents: number } {
	const cents = Number.isFinite(dollars) ? Math.round(dollars * 100) : 0;
	const tokens = tokensForCents(cents, tokensPerDollar);
	return { tokens, worthCents: centsForTokens(tokens) };
}
