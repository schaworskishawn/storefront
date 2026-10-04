import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AGE_VERIFIED_COOKIE } from "@/lib/age-gate";
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
