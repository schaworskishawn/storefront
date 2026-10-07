import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	DEFAULT_DESK,
	DEFAULT_PANELS,
	DEFAULT_SHORTCUTS,
	NAME_MAX,
	NOTES_MAX,
	SHORTCUT_MAX,
	STATUS_MAX,
	addShortcut,
	cleanHref,
	cleanLine,
	coverName,
	initialsOf,
	isExternalHref,
	movePanel,
	normalizeDesk,
	normalizePanels,
	normalizeProfile,
	reorderPanel,
	type PanelId,
	type Shortcut,
} from "./model";

describe("normalizePanels", () => {
	it("keeps a saved order", () => {
		expect(normalizePanels(["clock", "notes", "appearance", "shortcuts"])).toEqual([
			"clock",
			"notes",
			"appearance",
			"shortcuts",
		]);
	});

	it("puts back any panel that is missing, at the end", () => {
		expect(normalizePanels(["clock"])).toEqual(["clock", "shortcuts", "notes", "appearance"]);
	});

	it("drops unknown ids and repeats", () => {
		expect(normalizePanels(["clock", "bogus", "clock", 7, null, "notes"])).toEqual([
			"clock",
			"notes",
			"shortcuts",
			"appearance",
		]);
	});

	it("falls back to the default order for anything that isn't a list", () => {
		for (const bad of [undefined, null, "clock", 5, {}]) expect(normalizePanels(bad)).toEqual(DEFAULT_PANELS);
	});
});

describe("movePanel", () => {
	const order: PanelId[] = ["shortcuts", "notes", "clock", "appearance"];

	it("swaps a panel with its neighbour", () => {
		expect(movePanel(order, "notes", -1)).toEqual(["notes", "shortcuts", "clock", "appearance"]);
		expect(movePanel(order, "notes", 1)).toEqual(["shortcuts", "clock", "notes", "appearance"]);
	});

	it("leaves the first panel in place when moved earlier, and the last when moved later", () => {
		expect(movePanel(order, "shortcuts", -1)).toEqual(order);
		expect(movePanel(order, "appearance", 1)).toEqual(order);
	});

	it("doesn't change the list it was given", () => {
		const copy = [...order];
		movePanel(order, "clock", -1);
		expect(order).toEqual(copy);
	});
});

describe("reorderPanel", () => {
	const order: PanelId[] = ["shortcuts", "notes", "clock", "appearance"];

	it("drops a panel into the place another holds, sliding the ones between", () => {
		expect(reorderPanel(order, "shortcuts", "clock")).toEqual(["notes", "clock", "shortcuts", "appearance"]);
		expect(reorderPanel(order, "appearance", "notes")).toEqual(["shortcuts", "appearance", "notes", "clock"]);
	});

	it("changes nothing for the same panel or an unknown one", () => {
		expect(reorderPanel(order, "notes", "notes")).toEqual(order);
		expect(reorderPanel(order, "notes", "bogus" as PanelId)).toEqual(order);
	});

	it("always keeps every panel exactly once", () => {
		for (const a of order)
			for (const b of order) expect([...reorderPanel(order, a, b)].sort()).toEqual([...order].sort());
	});
});

describe("cleanLine", () => {
	it("trims, collapses spaces and removes line breaks and control characters", () => {
		expect(cleanLine("  Ada \n\t Lovelace\u0007  ", 50)).toBe("Ada Lovelace");
	});

	it("cuts to length without leaving a trailing space", () => {
		expect(cleanLine("abcde fghij", 6)).toBe("abcde");
		expect(cleanLine("x".repeat(100), NAME_MAX)).toHaveLength(NAME_MAX);
	});

	it("gives an empty string for anything that isn't text", () => {
		for (const bad of [undefined, null, 5, {}, []]) expect(cleanLine(bad, 10)).toBe("");
	});
});

describe("normalizeProfile", () => {
	it("keeps a valid profile", () => {
		const profile = {
			displayName: "Ada",
			status: "Out for a walk",
			banner: "grid",
			avatar: { kind: "glyph", glyph: "rocket" },
		};
		expect(normalizeProfile(profile)).toEqual(profile);
	});

	it("falls back field by field", () => {
		expect(normalizeProfile({ banner: "nope", avatar: { kind: "glyph", glyph: "nope" } })).toEqual({
			displayName: "",
			status: "",
			banner: "aurora",
			avatar: { kind: "monogram", accent: "cyan" },
		});
	});

	it("limits the name and the status", () => {
		const profile = normalizeProfile({ displayName: "n".repeat(99), status: "s".repeat(999) });
		expect(profile.displayName).toHaveLength(NAME_MAX);
		expect(profile.status).toHaveLength(STATUS_MAX);
	});

	it("coerces junk to the default", () => {
		for (const bad of [undefined, null, "x", 5, []]) expect(normalizeProfile(bad).banner).toBe("aurora");
	});
});

describe("initialsOf", () => {
	it("takes the first letters of the first and last words", () => {
		expect(initialsOf("Ada Lovelace")).toBe("AL");
		expect(initialsOf("ada")).toBe("A");
		expect(initialsOf("Mary Ann Evans")).toBe("ME");
	});

	it("skips leading punctuation and handles other alphabets", () => {
		expect(initialsOf("  @neo  ")).toBe("N");
		expect(initialsOf("Émile Zola")).toBe("ÉZ");
	});

	it("shows a question mark when there is no name", () => {
		expect(initialsOf("")).toBe("?");
		expect(initialsOf("   ")).toBe("?");
		expect(initialsOf("***")).toBe("?");
	});
});

describe("cleanHref", () => {
	it("accepts paths on this site and web addresses", () => {
		expect(cleanHref("/shop")).toBe("/shop");
		expect(cleanHref("/shop?category=coils#top")).toBe("/shop?category=coils#top");
		expect(cleanHref("https://example.com/page")).toBe("https://example.com/page");
		expect(cleanHref("http://example.com")).toBe("http://example.com/");
	});

	it("adds https to a bare address", () => {
		expect(cleanHref("example.com")).toBe("https://example.com/");
		expect(cleanHref("  www.example.org/a  ")).toBe("https://www.example.org/a");
	});

	it("refuses anything that could run code or leave the site by a side door", () => {
		for (const bad of [
			"javascript:alert(1)",
			"JaVaScRiPt:alert(1)",
			"data:text/html,<script>1</script>",
			"vbscript:x",
			"//evil.example",
			"/\\evil.example",
			"ftp://example.com",
			"mailto:a@b.co",
		]) {
			expect(cleanHref(bad), bad).toBeNull();
		}
	});

	it("trims whitespace around an address, but refuses it inside one", () => {
		expect(cleanHref("  /shop \n")).toBe("/shop");
		expect(cleanHref("/sh\nop")).toBeNull();
		expect(cleanHref("/sh\u0007op")).toBeNull();
	});

	it("refuses empty, spaced, too-long and host-less input", () => {
		for (const bad of [
			"",
			"   ",
			"/sho p",
			"localhost",
			"http://intranet",
			"x".repeat(400),
			5,
			null,
			undefined,
		]) {
			expect(cleanHref(bad), String(bad)).toBeNull();
		}
	});

	it("tells a page on this site from another site", () => {
		expect(isExternalHref("/shop")).toBe(false);
		expect(isExternalHref("https://example.com/")).toBe(true);
	});
});

describe("addShortcut", () => {
	const base: Shortcut[] = [{ id: "a", label: "Shop", href: "/shop" }];

	it("adds a clean shortcut", () => {
		expect(addShortcut(base, { label: "  Learn  ", href: "/learn" }, "b")).toEqual({
			ok: true,
			shortcuts: [...base, { id: "b", label: "Learn", href: "/learn" }],
		});
	});

	it("says why it can't add", () => {
		expect(addShortcut(base, { label: " ", href: "/learn" }, "b")).toMatchObject({
			ok: false,
			error: expect.stringMatching(/name/),
		});
		expect(addShortcut(base, { label: "Bad", href: "javascript:alert(1)" }, "b")).toMatchObject({
			ok: false,
			error: expect.stringMatching(/web address/),
		});
		expect(addShortcut(base, { label: "Again", href: "/shop" }, "b")).toMatchObject({
			ok: false,
			error: expect.stringMatching(/already/),
		});
	});

	it("stops at the limit", () => {
		const full = Array.from({ length: SHORTCUT_MAX }, (_, i) => ({
			id: `s${i}`,
			label: `S${i}`,
			href: `/p${i}`,
		}));
		expect(addShortcut(full, { label: "One more", href: "/more" }, "x")).toMatchObject({
			ok: false,
			error: expect.stringContaining(String(SHORTCUT_MAX)),
		});
	});

	it("doesn't change the list it was given", () => {
		addShortcut(base, { label: "Learn", href: "/learn" }, "b");
		expect(base).toHaveLength(1);
	});
});

describe("normalizeDesk", () => {
	it("gives the default desk for nothing or junk", () => {
		for (const bad of [undefined, null, "x", 5, []]) expect(normalizeDesk(bad)).toEqual(DEFAULT_DESK);
	});

	it("round-trips a valid desk", () => {
		const desk = {
			...DEFAULT_DESK,
			notes: "buy more coils",
			clock24: true,
			panels: ["clock", "notes", "shortcuts", "appearance"] as PanelId[],
			appearance: { accent: "gold" as const, effects: false, compact: true },
		};
		expect(normalizeDesk(JSON.parse(JSON.stringify(desk)))).toEqual(desk);
	});

	it("keeps the line breaks in notes, and caps their length", () => {
		expect(normalizeDesk({ notes: "a\nb" }).notes).toBe("a\nb");
		expect(normalizeDesk({ notes: "n".repeat(NOTES_MAX + 50) }).notes).toHaveLength(NOTES_MAX);
		expect(normalizeDesk({ notes: 42 }).notes).toBe("");
	});

	it("cleans saved shortcuts: bad addresses, repeated ids and anything past the limit are dropped", () => {
		const desk = normalizeDesk({
			shortcuts: [
				{ id: "a", label: "Fine", href: "/shop" },
				{ id: "a", label: "Same id", href: "/learn" },
				{ id: "b", label: "Evil", href: "javascript:alert(1)" },
				{ id: "c", label: "", href: "/faqs" },
				{ id: "d", label: "No id kept?", href: "/faqs" },
				"junk",
				null,
			],
		});
		expect(desk.shortcuts.map((s) => s.id)).toEqual(["a", "d"]);
		const many = normalizeDesk({
			shortcuts: Array.from({ length: SHORTCUT_MAX + 5 }, (_, i) => ({
				id: `s${i}`,
				label: `S${i}`,
				href: `/p${i}`,
			})),
		});
		expect(many.shortcuts).toHaveLength(SHORTCUT_MAX);
	});

	it("keeps an empty shortcut list as empty (the visitor removed them all) but defaults a missing one", () => {
		expect(normalizeDesk({ shortcuts: [] }).shortcuts).toEqual([]);
		expect(normalizeDesk({}).shortcuts).toEqual(DEFAULT_SHORTCUTS);
	});

	it("defaults the effects on and everything else off or neutral", () => {
		expect(normalizeDesk({ appearance: {} }).appearance).toEqual({
			accent: "cyan",
			effects: true,
			compact: false,
		});
		expect(normalizeDesk({ appearance: { accent: "nope", effects: "no" } }).appearance.accent).toBe("cyan");
		expect(normalizeDesk({ appearance: { effects: false } }).appearance.effects).toBe(false);
	});
});

describe("starting shortcuts", () => {
	it("all go to pages that exist", () => {
		for (const shortcut of DEFAULT_SHORTCUTS) {
			expect(existsSync(`src/app/(root)${shortcut.href}/page.tsx`), shortcut.href).toBe(true);
		}
	});
});

describe("coverName", () => {
	it("prefers the chosen name, then the account's, then Guest", () => {
		expect(coverName({ ...DEFAULT_DESK.profile, displayName: "Ada" }, "Account Name")).toBe("Ada");
		expect(coverName(DEFAULT_DESK.profile, "  Account   Name ")).toBe("Account Name");
		expect(coverName(DEFAULT_DESK.profile)).toBe("Guest");
		expect(coverName(DEFAULT_DESK.profile, "   ")).toBe("Guest");
	});
});
