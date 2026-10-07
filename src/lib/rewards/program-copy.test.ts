import { describe, expect, it } from "vitest";
import {
	describeExpiry,
	describeProgram,
	formatDollars,
	formatRate,
	hundredTokensWorth,
	previewEarn,
	tokenCount,
} from "./program-copy";

describe("describeProgram", () => {
	it("states the rate, what a token is worth, and when tokens expire", () => {
		const text = describeProgram({ tokensPerDollar: 3, expiryMonths: 12 });
		expect(text).toContain("earn 3 Vapor Tokens for every $1");
		expect(text).toContain("100 tokens take $5 off");
		expect(text).toContain("expire 12 months after you earn them");
	});

	it("follows the configured numbers rather than the defaults", () => {
		const text = describeProgram({ tokensPerDollar: 5, expiryMonths: 6 });
		expect(text).toContain("earn 5 Vapor Tokens");
		expect(text).toContain("expire 6 months");
	});

	it("says one month, not one months", () => {
		expect(describeProgram({ tokensPerDollar: 3, expiryMonths: 1 })).toContain("expire 1 month after");
	});

	it("says tokens don't expire when there is no expiry", () => {
		const text = describeProgram({ tokensPerDollar: 3, expiryMonths: 0 });
		expect(text).toContain("Tokens don't expire.");
		expect(text).not.toMatch(/expire \d/);
	});

	it("shows a fractional rate without float noise", () => {
		expect(describeProgram({ tokensPerDollar: 2.5, expiryMonths: 12 })).toContain("earn 2.5 Vapor Tokens");
		expect(describeProgram({ tokensPerDollar: 0.1 + 0.2, expiryMonths: 12 })).toContain(
			"earn 0.3 Vapor Tokens",
		);
	});
});

describe("formatRate", () => {
	it("shows whole and fractional rates without float noise", () => {
		expect(formatRate(3)).toBe("3");
		expect(formatRate(2.5)).toBe("2.5");
		expect(formatRate(0.1 + 0.2)).toBe("0.3");
	});
});

describe("describeExpiry", () => {
	it("gives a short stat and a sentence for an expiry", () => {
		expect(describeExpiry(12)).toEqual({
			short: "12 months",
			sentence: "Tokens expire 12 months after you earn them.",
		});
		expect(describeExpiry(1).short).toBe("1 month");
	});

	it("says never when there is no expiry", () => {
		expect(describeExpiry(0)).toEqual({ short: "Never", sentence: "Tokens don't expire." });
	});
});

describe("previewEarn", () => {
	it("works out tokens and what they are worth", () => {
		expect(previewEarn(100, 3)).toEqual({ tokens: 300, worthCents: 1500 });
		expect(previewEarn(24.99, 3)).toEqual({ tokens: 74, worthCents: 370 });
	});

	it("at the default rate, $100 earns 100 tokens worth $5 (5% back)", () => {
		expect(previewEarn(100, 1)).toEqual({ tokens: 100, worthCents: 500 });
	});

	it("never awards a part-token", () => {
		expect(previewEarn(0.3, 3)).toEqual({ tokens: 0, worthCents: 0 });
	});

	it("follows the configured rate", () => {
		expect(previewEarn(50, 5)).toEqual({ tokens: 250, worthCents: 1250 });
	});

	it("returns nothing for empty or nonsense amounts", () => {
		expect(previewEarn(0, 3)).toEqual({ tokens: 0, worthCents: 0 });
		expect(previewEarn(-20, 3)).toEqual({ tokens: 0, worthCents: 0 });
		expect(previewEarn(Number.NaN, 3)).toEqual({ tokens: 0, worthCents: 0 });
	});
});

describe("tokenCount", () => {
	it("says token for one and tokens otherwise", () => {
		expect(tokenCount(1)).toBe("1 token");
		expect(tokenCount(3)).toBe("3 tokens");
		expect(tokenCount(2.5)).toBe("2.5 tokens");
	});
});

describe("describeProgram grammar", () => {
	it("says one Vapor Token, not one Vapor Tokens", () => {
		const text = describeProgram({ tokensPerDollar: 1, expiryMonths: 12 });
		expect(text).toContain("earn 1 Vapor Token for every $1");
		expect(text).toContain("100 tokens take $5 off your order");
	});
});

describe("formatDollars", () => {
	it("drops the cents from whole dollars and keeps them otherwise", () => {
		expect(formatDollars(100)).toBe("$1");
		expect(formatDollars(500)).toBe("$5");
		expect(formatDollars(50)).toBe("$0.50");
		expect(formatDollars(125)).toBe("$1.25");
	});
});

describe("hundredTokensWorth", () => {
	it("states what 100 tokens take off an order, and is what the program sentence quotes", () => {
		// A token is worth five cents today. If that changes, this and every page's wording move together.
		expect(hundredTokensWorth()).toBe("$5");
		expect(describeProgram({ tokensPerDollar: 3, expiryMonths: 12 })).toContain(
			`100 tokens take ${hundredTokensWorth()} off`,
		);
	});
});
