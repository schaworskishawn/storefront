import { describe, expect, it } from "vitest";
import {
	DEFAULT_EXPIRY_MONTHS,
	DEFAULT_TOKENS_PER_DOLLAR,
	centsForTokens,
	earnBaseCents,
	expiryDateFor,
	readRewardsConfig,
	tokensForCents,
	tokensInCents,
} from "./tokens";

describe("readRewardsConfig", () => {
	it("is off, at 3 tokens per dollar and 12 months, when nothing is set", () => {
		expect(readRewardsConfig({})).toEqual({
			enabled: false,
			tokensPerDollar: DEFAULT_TOKENS_PER_DOLLAR,
			expiryMonths: DEFAULT_EXPIRY_MONTHS,
		});
		expect(DEFAULT_TOKENS_PER_DOLLAR).toBe(3);
		expect(DEFAULT_EXPIRY_MONTHS).toBe(12);
	});

	it("reads the flag, a rate (including a fraction) and an expiry, where 0 means never", () => {
		expect(readRewardsConfig({ enabled: "true", tokensPerDollar: "2.5", expiryMonths: "6" })).toEqual({
			enabled: true,
			tokensPerDollar: 2.5,
			expiryMonths: 6,
		});
		expect(readRewardsConfig({ expiryMonths: "0" }).expiryMonths).toBe(0);
	});

	it("falls back to the defaults for nonsense", () => {
		const config = readRewardsConfig({ tokensPerDollar: "lots", expiryMonths: "-3" });
		expect(config.tokensPerDollar).toBe(3);
		expect(config.expiryMonths).toBe(12);
		expect(readRewardsConfig({ tokensPerDollar: "0" }).tokensPerDollar).toBe(3);
	});

	it("only treats the literal string 'true' as on", () => {
		expect(readRewardsConfig({ enabled: "1" }).enabled).toBe(false);
		expect(readRewardsConfig({ enabled: "TRUE" }).enabled).toBe(false);
	});
});

describe("tokensForCents", () => {
	it("gives 3 tokens per dollar: a $60 order earns 180", () => {
		expect(tokensForCents(6000, 3)).toBe(180);
		expect(tokensForCents(100, 3)).toBe(3);
	});

	it("rounds down, so a part-token is never awarded", () => {
		expect(tokensForCents(99, 3)).toBe(2);
		expect(tokensForCents(33, 3)).toBe(0);
		expect(tokensForCents(1999, 3)).toBe(59);
	});

	it("handles fractional rates without float noise", () => {
		expect(tokensForCents(1000, 2.5)).toBe(25);
		expect(tokensForCents(10, 10)).toBe(1);
		expect(tokensForCents(1010, 1)).toBe(10);
	});

	it("earns nothing for nothing, a negative, or a nonsense rate", () => {
		for (const cents of [0, -500, Number.NaN, Number.POSITIVE_INFINITY * 0]) {
			expect(tokensForCents(cents, 3)).toBe(0);
		}
		expect(tokensForCents(1000, 0)).toBe(0);
		expect(tokensForCents(1000, -2)).toBe(0);
	});
});

describe("token value", () => {
	it("is one cent a token, so 100 tokens are worth a dollar", () => {
		expect(centsForTokens(100)).toBe(100);
		expect(centsForTokens(1240)).toBe(1240);
		expect(tokensInCents(1240)).toBe(1240);
	});

	it("round-trips whole tokens", () => {
		for (const tokens of [0, 1, 99, 5000]) expect(tokensInCents(centsForTokens(tokens))).toBe(tokens);
	});
});

describe("earnBaseCents", () => {
	const order = { chargedCents: 12300, shippingCents: 1000, taxCents: 1300, subtotalCents: 10000 };

	it("is what was paid for the products: no shipping, no tax", () => {
		expect(earnBaseCents(order)).toBe(10000);
	});

	it("earns nothing on the part paid with tokens or a gift card", () => {
		// $30 of the order was covered by tokens, so only $93 was paid in money.
		expect(earnBaseCents({ ...order, chargedCents: 9300 })).toBe(7000);
	});

	it("never earns on more than the products cost", () => {
		expect(earnBaseCents({ ...order, chargedCents: 99999 })).toBe(10000);
	});

	it("is zero, never negative, when little or nothing was paid in money", () => {
		expect(earnBaseCents({ ...order, chargedCents: 500 })).toBe(0);
		expect(earnBaseCents({ ...order, chargedCents: 0 })).toBe(0);
	});
});

describe("expiryDateFor", () => {
	it("is the same day, 12 months on", () => {
		expect(expiryDateFor(new Date("2026-10-06T15:00:00Z"), 12)).toBe("2027-10-06");
		expect(expiryDateFor(new Date("2026-10-06T15:00:00Z"), 6)).toBe("2027-04-06");
	});

	it("is null for 0, meaning never", () => {
		expect(expiryDateFor(new Date("2026-10-06T15:00:00Z"), 0)).toBeNull();
	});

	it("lands on a month's last day when the day doesn't exist later", () => {
		expect(expiryDateFor(new Date("2026-01-31T00:00:00Z"), 1)).toBe("2026-02-28");
		expect(expiryDateFor(new Date("2027-01-31T00:00:00Z"), 1)).toBe("2027-02-28");
		expect(expiryDateFor(new Date("2027-08-31T00:00:00Z"), 6)).toBe("2028-02-29");
		expect(expiryDateFor(new Date("2028-02-29T00:00:00Z"), 12)).toBe("2029-02-28");
	});

	it("carries across a year end and uses the UTC date", () => {
		expect(expiryDateFor(new Date("2026-11-15T00:00:00Z"), 3)).toBe("2027-02-15");
		expect(expiryDateFor(new Date("2026-10-06T23:59:59Z"), 12)).toBe("2027-10-06");
	});
});
