import { describe, expect, it } from "vitest";
import {
	ACCENTS,
	DEFAULT_PROFILE,
	NAME_MAX,
	STATUS_MAX,
	accentFor,
	cleanLine,
	coverName,
	initialsOf,
	isAccentId,
	normalizeProfile,
} from "./model";

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

	it("keeps a monogram's colour and falls back for an unknown one", () => {
		expect(normalizeProfile({ avatar: { kind: "monogram", accent: "gold" } }).avatar).toEqual({
			kind: "monogram",
			accent: "gold",
		});
		expect(normalizeProfile({ avatar: { kind: "monogram", accent: "nope" } }).avatar).toEqual({
			kind: "monogram",
			accent: "cyan",
		});
	});

	it("limits the name and the status", () => {
		const profile = normalizeProfile({ displayName: "n".repeat(99), status: "s".repeat(999) });
		expect(profile.displayName).toHaveLength(NAME_MAX);
		expect(profile.status).toHaveLength(STATUS_MAX);
	});

	it("strips markup-looking control characters and line breaks from typed text", () => {
		expect(normalizeProfile({ displayName: "Ada\nLovelace", status: "line one\r\nline two" })).toMatchObject({
			displayName: "Ada Lovelace",
			status: "line one line two",
		});
	});

	it("coerces junk to the default", () => {
		for (const bad of [undefined, null, "x", 5, []]) expect(normalizeProfile(bad)).toEqual(DEFAULT_PROFILE);
	});
});

describe("accents", () => {
	it("recognises only the listed colours", () => {
		for (const accent of ACCENTS) expect(isAccentId(accent.id)).toBe(true);
		expect(isAccentId("magenta")).toBe(false);
		expect(isAccentId(7)).toBe(false);
	});

	it("falls back to the first colour for an unknown one", () => {
		expect(accentFor("cyan").id).toBe("cyan");
		expect(accentFor("nope" as never).id).toBe(ACCENTS[0].id);
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

describe("coverName", () => {
	it("prefers the chosen name, then the account's, then Guest", () => {
		expect(coverName({ ...DEFAULT_PROFILE, displayName: "Ada" }, "Account Name")).toBe("Ada");
		expect(coverName(DEFAULT_PROFILE, "  Account   Name ")).toBe("Account Name");
		expect(coverName(DEFAULT_PROFILE)).toBe("Guest");
		expect(coverName(DEFAULT_PROFILE, "   ")).toBe("Guest");
	});
});
