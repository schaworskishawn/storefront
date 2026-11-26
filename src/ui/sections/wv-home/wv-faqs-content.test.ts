import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFaqs, SUPPORT_EMAIL } from "./wv-faqs-content";

const PAY_IN_4 =
	"Pay in 4: a quarter at checkout, then 3 equal payments every 14 days, with no interest or fees. Your order ships once the last payment is in. For orders from $50 to $1,000.";
const REWARDS = { tokensPerDollar: 3, expiryMonths: 12 };

const allOn = buildFaqs({ payIn4: PAY_IN_4, rewards: REWARDS });
const allOff = buildFaqs({ payIn4: null, rewards: null });
const answer = (faqs: ReturnType<typeof buildFaqs>, start: string) =>
	faqs.find((f) => f.q.startsWith(start))?.a ?? "";

describe("FAQ answers", () => {
	it("answers every question, with no placeholders left", () => {
		for (const faq of [...allOn, ...allOff]) {
			expect(faq.a.length).toBeGreaterThan(40);
			expect(faq.a).not.toMatch(/coming soon/i);
		}
	});

	it("asks each question once", () => {
		const qs = allOn.map((f) => f.q);
		expect(new Set(qs).size).toBe(qs.length);
	});

	it("links only to pages that exist", () => {
		for (const { link } of allOn) {
			if (!link) continue;
			const page = path.join(process.cwd(), "src/app/(root)", link.href.slice(1), "page.tsx");
			expect(existsSync(page), link.href).toBe(true);
		}
	});

	it("lists the payment methods the payments page lists", () => {
		const a = answer(allOff, "What payment methods");
		for (const method of [
			"Visa",
			"Mastercard",
			"Discover",
			"American Express",
			"Interac e-Transfer",
			"Bitcoin",
			"gift cards",
		]) {
			expect(a).toContain(method);
		}
		expect(a).not.toContain("Vapor Tokens");
		expect(a).not.toContain("Pay in 4");
		expect(answer(allOn, "What payment methods")).toContain("Vapor Tokens and Pay in 4 at checkout");
	});

	it("mentions Pay in 4 and Vapor Tokens only while they are switched on", () => {
		expect(allOff.some((f) => /installments|Vapor Tokens\?/.test(f.q))).toBe(false);
		expect(answer(allOn, "Can I pay in installments")).toBe(`Yes, with ${PAY_IN_4}`);
		expect(answer(allOn, "What are Vapor Tokens")).toContain("3 Vapor Tokens for every $1");
		expect(answer(allOn, "What are Vapor Tokens")).toContain("expire 12 months");
	});

	it("words the wholesale answer from the distributor tiers", () => {
		const a = answer(allOff, "Do you offer wholesale");
		expect(a).toContain("5% to 25% off list");
		expect(a).toContain("orders of $250+ (Small Wholesale)");
		expect(a).toContain("orders of $10,000+ (Master Distributor)");
	});

	it("words the affiliate answer from the program's numbers, offering token payouts only with rewards on", () => {
		const on = answer(allOn, "Do you have an affiliate");
		expect(on).toContain("10% to 20% commission");
		expect(on).toContain("30-day cookie");
		expect(on).toContain("15 days after an order is paid, from a $50 minimum");
		expect(on).toContain("Vapor Tokens with a 25% bonus");
		expect(answer(allOff, "Do you have an affiliate")).not.toContain("Vapor Tokens");
	});

	it("points order changes to support", () => {
		expect(answer(allOff, "Can I change or cancel")).toContain(SUPPORT_EMAIL);
	});
});
