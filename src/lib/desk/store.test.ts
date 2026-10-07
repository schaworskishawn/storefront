import { describe, expect, it } from "vitest";
import { ACCENTS, BANNER_IDS, DEFAULT_DESK, GLYPH_IDS } from "./model";
import { ALL_ACCENT_IDS, BANNERS, GLYPHS, accentColors, accentTint } from "./art";
import { makeSnapshotReader } from "./store";

describe("makeSnapshotReader", () => {
	it("gives the default desk when nothing is stored", () => {
		expect(makeSnapshotReader(() => null)()).toBe(DEFAULT_DESK);
	});

	it("gives the default desk when what is stored isn't JSON", () => {
		expect(makeSnapshotReader(() => "{not json")()).toBe(DEFAULT_DESK);
	});

	it("reads a stored desk and cleans it", () => {
		const stored = JSON.stringify({ notes: "hi", profile: { displayName: "Ada", banner: "nope" } });
		const desk = makeSnapshotReader(() => stored)();
		expect(desk.notes).toBe("hi");
		expect(desk.profile.displayName).toBe("Ada");
		expect(desk.profile.banner).toBe("aurora");
	});

	it("hands back the very same object while the stored text is unchanged", () => {
		const stored = JSON.stringify({ notes: "hi" });
		const read = makeSnapshotReader(() => stored);
		expect(read()).toBe(read());
	});

	it("hands back a new desk when the stored text changes, and the default one again when it is cleared", () => {
		let stored: string | null = JSON.stringify({ notes: "one" });
		const read = makeSnapshotReader(() => stored);
		const first = read();
		stored = JSON.stringify({ notes: "two" });
		const second = read();
		expect(second).not.toBe(first);
		expect(second.notes).toBe("two");
		stored = null;
		expect(read()).toBe(DEFAULT_DESK);
	});

	it("only parses when the text changes", () => {
		let reads = 0;
		const stored = JSON.stringify({ notes: "hi" });
		const read = makeSnapshotReader(() => {
			reads += 1;
			return stored;
		});
		const first = read();
		read();
		read();
		expect(reads).toBe(3);
		expect(read()).toBe(first);
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
		expect(ALL_ACCENT_IDS).toEqual(ACCENTS.map((a) => a.id));
		expect(accentColors("cyan").color).toBe("hsl(185 100% 55%)");
		expect(accentColors("violet").ink).toBe("#ffffff");
		expect(accentTint("pink", 0.2)).toBe("hsl(300 100% 72% / 0.2)");
	});
});
