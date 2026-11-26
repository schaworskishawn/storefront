import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMMISSION_HOLD_DAYS, PAYOUT_MINIMUM_CENTS, REFERRAL_COOKIE_DAYS } from "@/lib/affiliates/tiers";
import { AGE_VERIFIED_COOKIE } from "@/lib/age-gate";
import { INSTALLMENT_INTERVAL_DAYS, LATER_PAYMENT_COUNT } from "@/lib/installments/plan";
import { formatDollars } from "@/lib/rewards/program-copy";
import { centsForTokens } from "@/lib/rewards/tokens";
import { BROWSE_LOCALE_COOKIE } from "@/lib/browse-locale";
import { ANNOUNCEMENT_DISMISS_COOKIE } from "@/lib/content/announcement-dismiss-key";
import { SITE_ACCESS_COOKIE } from "@/lib/site-password";
import { STORAGE_KEY as QUIT_STORAGE_KEY } from "@/ui/sections/wv-home/wv-quit-model";
import { ACCESSIBILITY_SECTIONS, ACCESSIBILITY_UPDATED } from "./accessibility";
import { COOKIE_SECTIONS, COOKIES_UPDATED } from "./cookies";
import { PRIVACY_SECTIONS, PRIVACY_UPDATED } from "./privacy";
import { TERMS_SECTIONS, TERMS_UPDATED } from "./terms";

const PAGES = {
	terms: { sections: TERMS_SECTIONS, updated: TERMS_UPDATED },
	privacy: { sections: PRIVACY_SECTIONS, updated: PRIVACY_UPDATED },
	cookies: { sections: COOKIE_SECTIONS, updated: COOKIES_UPDATED },
	accessibility: { sections: ACCESSIBILITY_SECTIONS, updated: ACCESSIBILITY_UPDATED },
};

const pageExists = (href: string) => existsSync(`src/app/(root)${href.split(/[?#]/)[0]}/page.tsx`);

describe.each(Object.entries(PAGES))("%s page copy", (_name, { sections, updated }) => {
	it("has a 'last updated' date in the same style as the others", () => {
		expect(updated).toMatch(/^[A-Z]+ \d{1,2}, \d{4}$/);
	});

	it("has sections with unique ids, titles and text", () => {
		expect(sections.length).toBeGreaterThan(0);
		const ids = sections.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const s of sections) {
			expect(s.id).toMatch(/^[a-z0-9-]+$/);
			expect(s.title.trim().length).toBeGreaterThan(0);
			expect(s.body.length).toBeGreaterThan(0);
			for (const paragraph of s.body) expect(paragraph.trim().length).toBeGreaterThan(20);
		}
	});

	it("only links to pages that exist", () => {
		for (const s of sections.filter((x) => x.link)) {
			expect(s.link?.href.startsWith("/"), s.id).toBe(true);
			expect(pageExists(s.link?.href ?? ""), `${s.id} -> ${s.link?.href}`).toBe(true);
			expect(s.link?.label.trim().length).toBeGreaterThan(0);
		}
	});
});

describe("the cookie policy matches the cookies the site really sets", () => {
	const text = COOKIE_SECTIONS.flatMap((s) => s.body).join("\n");

	it("names each cookie and storage key by its real name", () => {
		for (const name of [
			AGE_VERIFIED_COOKIE,
			BROWSE_LOCALE_COOKIE,
			ANNOUNCEMENT_DISMISS_COOKIE,
			SITE_ACCESS_COOKIE,
			QUIT_STORAGE_KEY,
		]) {
			expect(text, `cookie policy should mention ${name}`).toContain(name);
		}
	});

	it("names the services the site uses", () => {
		for (const service of ["Stripe", "AgeChecker.Net", "Vercel Speed Insights"])
			expect(text).toContain(service);
	});

	it("does not claim to use advertising cookies", () => {
		expect(text).toMatch(/do not use advertising/i);
	});
});

describe("the accessibility statement", () => {
	const text = ACCESSIBILITY_SECTIONS.flatMap((s) => [s.title, ...s.body]).join("\n");

	it("states the goal without claiming full conformance", () => {
		expect(text).toMatch(/WCAG\)? 2\.1 Level AA/);
		expect(text).not.toMatch(/fully (compliant|conform|accessible)|100% accessible/i);
	});

	it("is upfront about limitations and says how to get help", () => {
		expect(ACCESSIBILITY_SECTIONS.map((s) => s.id)).toEqual(
			expect.arrayContaining(["known-limitations", "need-help-ordering", "feedback"]),
		);
		expect(text).toContain("support@worldwidevapor.com");
	});
});

describe("the terms match what the rest of the site says", () => {
	const section = (id: string) => (TERMS_SECTIONS.find((s) => s.id === id)?.body ?? []).join("\n");

	it("lists the payment methods the payments page lists, and Pay in 4's schedule from its settings", () => {
		const text = section("pricing-and-payment");
		for (const method of [
			"Visa",
			"Mastercard",
			"Discover",
			"American Express",
			"Interac e-Transfer",
			"crypto",
			"gift cards",
		])
			expect(text).toContain(method);
		expect(text).toContain(`${LATER_PAYMENT_COUNT} equal payments every ${INSTALLMENT_INTERVAL_DAYS} days`);
	});

	it("gives the shipping page's cut-off, speeds and prices", () => {
		const text = section("shipping-and-delivery");
		for (const fact of ["2PM EST", "3-5 business days", "$115", "$4.99", "$9.99", "$24.99"])
			expect(text).toContain(fact);
	});

	it("gives the returns page's window, exclusions and fee", () => {
		const text = section("returns-and-refunds");
		for (const fact of ["15 days", "Opened e-liquids", "unboxed disposables", "$4.99", "3-5 business days"])
			expect(text).toContain(fact);
	});

	it("words the programs from their settings", () => {
		expect(section("vapor-tokens-and-gift-cards")).toContain(
			`100 tokens take ${formatDollars(centsForTokens(100))} off`,
		);
		const programs = section("affiliate-and-distributor-programs");
		expect(programs).toContain(`within ${REFERRAL_COOKIE_DAYS} days`);
		expect(programs).toContain(`payable ${COMMISSION_HOLD_DAYS} days after`);
		expect(programs).toContain(`${formatDollars(PAYOUT_MINIMUM_CENTS)} minimum`);
	});

	it("names the age-verification provider the cookie policy names", () => {
		expect(section("age-verification")).toContain("AgeChecker.Net");
	});
});

describe("the privacy policy matches who the site really shares data with", () => {
	const text = PRIVACY_SECTIONS.flatMap((s) => s.body).join("\n");
	const read = (path: string) => readFileSync(path, "utf8");

	it("names each service the code sends personal data to", () => {
		// Each pair: the service as the policy names it, and the code that proves the site uses it.
		const services: [string, string, RegExp][] = [
			["Resend", "src/lib/email.ts", /api\.resend\.com|Resend/],
			["AgeChecker.Net", "src/checkout/lib/identity-verification/agechecker/client.ts", /agechecker/i],
			["NOWPayments", "src/lib/affiliates/nowpayments-payouts.ts", /nowpayments/i],
			["Anthropic", "src/lib/affiliates/ai-review.ts", /anthropic/i],
			["Saleor", "src/lib/reviews.ts", /Saleor/],
		];
		for (const [name, file, proof] of services) {
			expect(read(file), `${file} should still use ${name}`).toMatch(proof);
			expect(text, `the privacy policy should name ${name}`).toContain(name);
		}
	});

	it("says the AI reviewer never sees names, emails or phone numbers, as its code promises", () => {
		expect(read("src/lib/affiliates/ai-review.ts")).toMatch(/never their name, email/);
		expect(text).toMatch(/never names, email addresses, phone numbers/);
	});

	it("keeps the promises the hero's chips make", () => {
		expect(text).toMatch(/We do not sell your personal information/);
		expect(text).toMatch(/encrypted \(SSL\)/);
		expect(text).toMatch(/do not use advertising/i);
	});
});

describe("the legal heroes' highlight chips", () => {
	const PAGE_FILES: Record<keyof typeof PAGES, string> = {
		terms: "terms-and-conditions",
		privacy: "privacy-policy",
		cookies: "cookie-policy",
		accessibility: "accessibility",
	};

	it.each(Object.entries(PAGE_FILES))("%s: each chip opens a section that exists", (name, folder) => {
		const source = readFileSync(`src/app/(root)/${folder}/page.tsx`, "utf8");
		const targets = [...source.matchAll(/section: "([^"]+)"/g)].map((m) => m[1]);
		expect(targets.length).toBeGreaterThan(0);
		const ids = PAGES[name as keyof typeof PAGES].sections.map((s) => s.id);
		for (const target of targets) expect(ids, `${name} chip -> #${target}`).toContain(target);
	});

	it.each(Object.entries(PAGE_FILES))("%s: every lit phrase is in the intro", (_name, folder) => {
		const source = readFileSync(`src/app/(root)/${folder}/page.tsx`, "utf8");
		const intro = source.match(/intro="([^"]+)"/)?.[1] ?? "";
		const keys = JSON.parse(source.match(/introKeys=\{(\[[^\]]*\])\}/)?.[1] ?? "[]") as string[];
		expect(keys.length).toBeGreaterThan(0);
		for (const key of keys) expect(intro).toContain(key);
	});
});
