import { describe, expect, it } from "vitest";
import { describeProgram } from "./program-copy";

describe("describeProgram", () => {
	it("states the rate, what a token is worth, and when tokens expire", () => {
		const text = describeProgram({ tokensPerDollar: 3, expiryMonths: 12 });
		expect(text).toContain("earn 3 Vapor Tokens for every $1");
		expect(text).toContain("100 tokens take $1 off");
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
