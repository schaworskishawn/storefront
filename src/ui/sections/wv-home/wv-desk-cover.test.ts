import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE, type Profile } from "@/lib/desk/model";
import { AvatarBadge, DeskCover } from "./wv-desk-cover";
import { DeskApp } from "./wv-desk-app";

const text = (html: string) =>
	html
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();

describe("AvatarBadge", () => {
	it("shows a monogram as the initials in the chosen colour, hidden from screen readers (the name sits beside it)", () => {
		const profile: Profile = { ...DEFAULT_PROFILE, avatar: { kind: "monogram", accent: "pink" } };
		const html = renderToStaticMarkup(createElement(AvatarBadge, { profile, name: "Ada Lovelace" }));
		expect(text(html)).toBe("AL");
		expect(html).toContain('aria-hidden="true"');
		expect(html).toContain("hsl(300 100% 72%)");
	});

	it("shows a picture with a label for people who can't see it", () => {
		const profile: Profile = { ...DEFAULT_PROFILE, avatar: { kind: "glyph", glyph: "rocket" } };
		const html = renderToStaticMarkup(createElement(AvatarBadge, { profile, name: "Ada" }));
		expect(html).toContain('role="img"');
		expect(html).toContain('aria-label="Rocket"');
		expect(html).toContain("🚀");
	});

	it("shows a question mark when there is no name to take initials from", () => {
		const html = renderToStaticMarkup(createElement(AvatarBadge, { profile: DEFAULT_PROFILE, name: "" }));
		expect(text(html)).toBe("?");
	});
});

describe("on the server, before the browser's saved desk can be read", () => {
	it("the cover is a placeholder, not a flash of the default cover", () => {
		const html = renderToStaticMarkup(createElement(DeskCover, { fallbackName: "Ada" }));
		expect(html).toContain("animate-pulse");
		expect(text(html)).toBe("");
	});

	it("the whole desk is a placeholder too, marked busy", () => {
		const html = renderToStaticMarkup(createElement(DeskApp));
		expect(html).toContain('aria-busy="true"');
		expect(html.match(/animate-pulse/g)?.length).toBe(5);
		expect(text(html)).toBe("");
	});
});
