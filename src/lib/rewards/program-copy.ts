import type { RewardsConfig } from "./tokens";

/**
 * The shopper-facing description of the Vapor Tokens program, worded from the live settings so a page never promises a
 * rate or expiry the store isn't actually using. Pure and client-safe.
 */
export function describeProgram(config: Pick<RewardsConfig, "tokensPerDollar" | "expiryMonths">): string {
	const rate = Number.isInteger(config.tokensPerDollar)
		? String(config.tokensPerDollar)
		: String(Math.round(config.tokensPerDollar * 100) / 100);
	const expiry =
		config.expiryMonths > 0
			? `Tokens expire ${config.expiryMonths} ${config.expiryMonths === 1 ? "month" : "months"} after you earn them.`
			: "Tokens don't expire.";
	return `Signed-in customers earn ${rate} Vapor Tokens for every $1 spent on products. Spend them at checkout: 100 tokens take $1 off your order. ${expiry}`;
}
