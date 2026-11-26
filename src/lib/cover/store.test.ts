import { describe, expect, it } from "vitest";
import { BANNER_IDS, DEFAULT_PROFILE, GLYPH_IDS } from "./model";
import { BANNERS, GLYPHS, accentColors } from "./art";
import { makeSnapshotReader } from "./store";

describe("makeSnapshotReader", () => {
	it("gives the default cover when nothing is stored", () => {
		expect(makeSnapshotReader(() => null)()).toBe(DEFAULT_PROFILE);
	});

	it("gives the default cover when what is stored isn't JSON", () => {
		expect(makeSnapshotReader(() => "{not json")()).toBe(DEFAULT_PROFILE);
	});

	it("reads a stored cover and cleans it", () => {
		const stored = JSON.stringify({ displayName: "Ada", banner: "nope", status: "  hi  there " });
		const profile = makeSnapshotReader(() => stored)();
		expect(profile.displayName).toBe("Ada");
		expect(profile.status).toBe("hi there");
		expect(profile.banner).toBe("aurora");
	});

	it("hands back the very same object while the stored text is unchanged", () => {
		const stored = JSON.stringify({ displayName: "Ada" });
		const read = makeSnapshotReader(() => stored);
		expect(read()).toBe(read());
	});

	it("hands back a new cover when the stored text changes, and the default one again when it is cleared", () => {
		let stored: string | null = JSON.stringify({ displayName: "one" });
		const read = makeSnapshotReader(() => stored);
		const first = read();
		stored = JSON.stringify({ displayName: "two" });
		const second = read();
		expect(second).not.toBe(first);
		expect(second.displayName).toBe("two");
		stored = null;
		expect(read()).toBe(DEFAULT_PROFILE);
	});
});

describe("cover art", () => {
	it("has a banner and a picture for every choice, and nothing extra", () => {
		expect(Object.keys(BANNERS).sort()).toEqual([...BANNER_IDS].sort());
		expect(Object.keys(GLYPHS).sort()).toEqual([...GLYPH_IDS].sort());
	});

	it("labels every choice for people who can't see it", () => {
		for (const banner of Object.values(BANNERS)) expect(banner.label.length).toBeGreaterThan(2);
		for (const glyph of Object.values(GLYPHS)) {
			expect(glyph.label.length).toBeGreaterThan(2);
			expect(glyph.emoji.length).toBeGreaterThan(0);
		}
	});

	it("draws banners in CSS alone, with no outside files", () => {
		for (const banner of Object.values(BANNERS)) expect(banner.css).not.toMatch(/url\(/);
	});

	it("turns an accent into a colour and a readable text colour", () => {
		expect(accentColors("cyan").color).toBe("hsl(185 100% 55%)");
		expect(accentColors("violet").ink).toBe("#ffffff");
	});
});
