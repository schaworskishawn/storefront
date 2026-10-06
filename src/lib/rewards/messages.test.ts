import { describe, expect, it } from "vitest";
import {
	formatCents,
	formatDate,
	formatTokens,
	staffAlert,
	tokensEarnedEmail,
	tokensReturnedEmail,
} from "./messages";

describe("formatting", () => {
	it("formats money, token counts and a calendar date", () => {
		expect(formatCents(300, "CAD")).toContain("3.00");
		expect(formatTokens(1240)).toMatch(/1.240/);
		expect(formatDate("2027-10-06")).toBe("October 6, 2027");
		expect(formatDate("2027-01-01")).toBe("January 1, 2027");
	});
});

describe("tokensEarnedEmail", () => {
	const email = tokensEarnedEmail({
		orderNumber: "1042",
		tokens: 300,
		currency: "CAD",
		expiryDate: "2027-10-06",
	});

	it("says what was earned and what it is worth", () => {
		expect(email.subject).toContain("300 Vapor Tokens");
		expect(email.subject).toContain("#1042");
		expect(email.text).toContain("300 Vapor Tokens (worth");
		expect(email.text).toContain("3.00");
	});

	it("says how to spend them and when they expire", () => {
		expect(email.text).toMatch(/at checkout/);
		expect(email.text).toMatch(/100 tokens take \$1.00 off/);
		expect(email.text).toContain("October 6, 2027");
	});

	it("says the tokens don't expire when they don't", () => {
		const forever = tokensEarnedEmail({ orderNumber: "1", tokens: 5, currency: "CAD", expiryDate: null });
		expect(forever.text).toMatch(/don't expire/);
		expect(forever.text).not.toMatch(/expire on/);
	});
});

describe("tokensReturnedEmail", () => {
	it("tells the customer their tokens are back, and how many", () => {
		const email = tokensReturnedEmail({ orderNumber: "1042", tokens: 500, currency: "CAD" });
		expect(email.subject).toContain("returned");
		expect(email.text).toContain("500 Vapor Tokens");
		expect(email.text).toContain("5.00");
		expect(email.text).toMatch(/cancelled/);
	});
});

describe("staffAlert", () => {
	it("names the order and the problem, and says where to look", () => {
		const alert = staffAlert("duplicate-lots", "1042", "Two lots.");
		expect(alert.subject).toBe("[Vapor Tokens] Vapor Tokens were awarded twice for one order (order #1042)");
		expect(alert.text).toContain("Two lots.");
		expect(alert.text).toContain("docs/payments-setup.md");
	});

	it("has a distinct subject for every kind", () => {
		const kinds = [
			"create-failed",
			"code-missing",
			"duplicate-lots",
			"restore-failed",
			"clawback-failed",
		] as const;
		expect(new Set(kinds.map((kind) => staffAlert(kind, "1", "x").subject)).size).toBe(kinds.length);
	});
});
