import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TokenLot } from "@/lib/rewards/lots";
import { RewardsAccountView, RewardsSignInPrompt } from "./wv-rewards-account-view";

const NOW = new Date("2026-10-06T12:00:00Z");

const lot = (overrides: Partial<TokenLot> & Pick<TokenLot, "id">): TokenLot => ({
	currency: "CAD",
	balanceCents: 0,
	initialCents: 0,
	expiryDate: "2027-10-06",
	createdAt: "2026-10-01T00:00:00Z",
	isActive: true,
	orderId: "order",
	...overrides,
});

const render = (lots: TokenLot[]) =>
	renderToStaticMarkup(createElement(RewardsAccountView, { lots, now: NOW, bcp47: "en-CA" }));
// Strips tags so assertions read the text a shopper sees.
const text = (html: string) =>
	html
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();

describe("RewardsAccountView", () => {
	it("shows the balance in tokens and what it is worth", () => {
		const shown = text(
			render([
				lot({ id: "a", balanceCents: 1234, initialCents: 3000 }),
				lot({ id: "b", balanceCents: 500, initialCents: 500 }),
			]),
		);
		// $17.34 of balance is 346 whole tokens at five cents each; the 4 cents over aren't a token, so the worth is $17.30.
		expect(shown).toContain("346 TOKENS");
		expect(shown).toContain("Worth $17.30 off your next order");
	});

	it("warns about tokens expiring within 30 days, with the date", () => {
		const shown = text(
			render([lot({ id: "a", balanceCents: 800, initialCents: 800, expiryDate: "2026-10-20" })]),
		);
		expect(shown).toContain("160 tokens expire on Oct 20, 2026.");
	});

	it("doesn't warn when nothing expires soon", () => {
		expect(text(render([lot({ id: "a", balanceCents: 800, initialCents: 800 })]))).not.toContain("expire on");
	});

	it("invites a first order when there are no tokens at all", () => {
		const shown = text(render([]));
		expect(shown).toContain("0 TOKENS");
		expect(shown).toContain("No tokens yet.");
	});

	it("keeps one balance per currency", () => {
		const shown = text(
			render([
				lot({ id: "a", balanceCents: 300, initialCents: 300 }),
				lot({ id: "b", currency: "USD", balanceCents: 900, initialCents: 900 }),
			]),
		);
		expect(shown).toContain("YOUR BALANCE (CAD)");
		expect(shown).toContain("YOUR BALANCE (USD)");
		expect(shown).toContain("60 TOKENS");
		expect(shown).toContain("180 TOKENS");
	});

	it("lists each order with its status, newest first", () => {
		const html = render([
			lot({ id: "old", createdAt: "2026-01-05T00:00:00Z", balanceCents: 0, initialCents: 600 }),
			lot({ id: "new", createdAt: "2026-09-20T00:00:00Z", balanceCents: 450, initialCents: 450 }),
			lot({
				id: "gone",
				createdAt: "2026-06-01T00:00:00Z",
				isActive: false,
				balanceCents: 200,
				initialCents: 200,
			}),
			lot({
				id: "stale",
				createdAt: "2025-01-01T00:00:00Z",
				balanceCents: 100,
				initialCents: 100,
				expiryDate: "2026-01-01",
			}),
		]);
		const shown = text(html);
		expect(shown).toContain("Active");
		expect(shown).toContain("Used up");
		expect(shown).toContain("Taken back");
		expect(shown).toContain("Expired");
		expect(html.indexOf("Sep 20, 2026")).toBeLessThan(html.indexOf("Jun 1, 2026"));
		expect(html.indexOf("Jun 1, 2026")).toBeLessThan(html.indexOf("Jan 5, 2026"));
	});

	it("doesn't count taken-back, used or expired lots in the balance", () => {
		const shown = text(
			render([
				lot({ id: "gone", isActive: false, balanceCents: 5000, initialCents: 5000 }),
				lot({ id: "stale", balanceCents: 5000, initialCents: 5000, expiryDate: "2026-01-01" }),
				lot({ id: "ok", balanceCents: 250, initialCents: 250 }),
			]),
		);
		expect(shown).toContain("50 TOKENS");
		expect(shown).not.toContain("2,050");
		expect(shown).not.toContain("1,050");
	});

	it("shows Never for tokens that don't expire", () => {
		expect(
			text(render([lot({ id: "a", balanceCents: 100, initialCents: 100, expiryDate: null })])),
		).toContain("Never");
	});

	it("lists only the ten most recent orders and says so", () => {
		const lots = Array.from({ length: 12 }, (_, i) =>
			lot({
				id: `lot-${i}`,
				createdAt: `2026-0${(i % 9) + 1}-${String(10 + i).padStart(2, "0")}T00:00:00Z`,
				balanceCents: 100,
				initialCents: 100,
			}),
		);
		const html = render(lots);
		expect(html.match(/<tr /g)?.length).toBe(10);
		expect(text(html)).toContain("Showing your 10 most recent of 12 orders.");
	});
});

describe("RewardsSignInPrompt", () => {
	it("sends visitors to sign in or create an account", () => {
		const html = renderToStaticMarkup(createElement(RewardsSignInPrompt));
		expect(html).toContain('href="/login"');
		expect(html).toContain('href="/register"');
		expect(text(html)).toContain("SIGN IN TO SEE YOUR TOKENS");
	});
});
