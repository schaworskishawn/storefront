import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FOOTER_COLUMNS, FOOTER_HREFS, LEGAL_LINKS } from "./wv-footer-links";

const pageExists = (href: string) => existsSync(`src/app/(root)${href.split(/[?#]/)[0]}/page.tsx`);

/** Footer labels whose page hasn't been built yet (they render as a placeholder `#` link). Remove one once it has a page. */
const NOT_BUILT_YET = ["About Us"];

const labels = FOOTER_COLUMNS.flatMap((c) => c.links);

describe("footer links", () => {
	it("sends every label somewhere, except the pages not built yet", () => {
		for (const label of labels.filter((l) => !NOT_BUILT_YET.includes(l))) {
			expect(FOOTER_HREFS[label], label).toBeTruthy();
		}
	});

	it("keeps the not-built-yet list honest", () => {
		for (const label of NOT_BUILT_YET) {
			expect(labels).toContain(label);
			expect(FOOTER_HREFS[label], `${label} now has a link: take it off NOT_BUILT_YET`).toBeUndefined();
		}
	});

	it("only links to pages that exist", () => {
		for (const [label, href] of Object.entries(FOOTER_HREFS)) {
			if (href.startsWith("mailto:")) continue;
			expect(href.startsWith("/"), `${label} -> ${href}`).toBe(true);
			expect(pageExists(href), `${label} -> ${href} has no page`).toBe(true);
		}
	});

	it("has no leftover entries for labels that aren't in the footer", () => {
		for (const label of Object.keys(FOOTER_HREFS)) expect(labels, label).toContain(label);
	});

	it("lists each label once", () => {
		expect(new Set(labels).size).toBe(labels.length);
	});

	it("does not bring back the links that were taken out", () => {
		expect(labels).not.toContain("Age Verification");
		expect(labels).not.toContain("Worldwide Shipping");
		// The footer says "Learn" (the guides library), not "Help Center" (the signed-in account's support page).
		expect(labels).not.toContain("Help Center");
		expect(FOOTER_HREFS.Learn).toBe("/learn");
	});
});

describe("the legal pages in the footer", () => {
	it("has Cookie Policy and Accessibility in the Help column", () => {
		const help = FOOTER_COLUMNS.find((c) => c.title === "HELP")?.links ?? [];
		expect(help).toEqual(
			expect.arrayContaining(["Terms & Conditions", "Privacy Policy", "Cookie Policy", "Accessibility"]),
		);
	});

	it("links the bottom line to the right pages", () => {
		expect(Object.fromEntries(LEGAL_LINKS.map((l) => [l.label, l.href]))).toEqual({
			Privacy: "/privacy-policy",
			Terms: "/terms-and-conditions",
			Cookies: "/cookie-policy",
			Accessibility: "/accessibility",
		});
		for (const l of LEGAL_LINKS) expect(pageExists(l.href), l.href).toBe(true);
	});

	it("uses the same pages as the Help column", () => {
		const hrefs = new Set([
			FOOTER_HREFS["Terms & Conditions"],
			FOOTER_HREFS["Privacy Policy"],
			FOOTER_HREFS["Cookie Policy"],
			FOOTER_HREFS.Accessibility,
		]);
		for (const l of LEGAL_LINKS) expect(hrefs.has(l.href), l.href).toBe(true);
	});
});
