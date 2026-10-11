/**
 * The customizable account cover: an abstract banner, an avatar (the visitor's initials or a picture), a display name and a short
 * status line, kept only in the visitor's browser. This is the data shape and the rules for cleaning anything read back from
 * storage (it can be missing, old, or edited by hand). No DOM and no React, so all of it is tested.
 */

// ----- Accents -----

/** The colour a visitor can give their initials. `hsl` is the main colour; `ink` is readable text on top of it. */
export const ACCENTS = [
	{ id: "cyan", label: "Cyan", hsl: "185 100% 55%", ink: "#05030a" },
	{ id: "pink", label: "Pink", hsl: "300 100% 72%", ink: "#05030a" },
	{ id: "violet", label: "Violet", hsl: "268 85% 66%", ink: "#ffffff" },
	{ id: "gold", label: "Gold", hsl: "45 100% 58%", ink: "#05030a" },
	{ id: "lime", label: "Lime", hsl: "95 85% 55%", ink: "#05030a" },
] as const;
export type AccentId = (typeof ACCENTS)[number]["id"];
export const DEFAULT_ACCENT: AccentId = "cyan";

export const isAccentId = (value: unknown): value is AccentId => ACCENTS.some((a) => a.id === value);
export const accentFor = (id: AccentId) => ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];

// ----- The cover -----

export const BANNER_IDS = ["aurora", "grid", "sunset", "waves", "circuit", "nebula"] as const;
export type BannerId = (typeof BANNER_IDS)[number];
export const DEFAULT_BANNER: BannerId = "aurora";
const isBannerId = (value: unknown): value is BannerId => BANNER_IDS.includes(value as BannerId);

export const GLYPH_IDS = [
	"bolt",
	"swirl",
	"fire",
	"alien",
	"rocket",
	"unicorn",
	"headphones",
	"flask",
] as const;
export type GlyphId = (typeof GLYPH_IDS)[number];
const isGlyphId = (value: unknown): value is GlyphId => GLYPH_IDS.includes(value as GlyphId);

/** The avatar: the visitor's initials on a colour, or one of a few pictures. */
export type Avatar = { kind: "monogram"; accent: AccentId } | { kind: "glyph"; glyph: GlyphId };

export const NAME_MAX = 32;
export const STATUS_MAX = 80;

export type Profile = {
	/** What the cover calls them. Empty means "use the account's name, or Guest". */
	displayName: string;
	/** A short line under the name. */
	status: string;
	banner: BannerId;
	avatar: Avatar;
};

export const DEFAULT_PROFILE: Profile = {
	displayName: "",
	status: "",
	banner: DEFAULT_BANNER,
	avatar: { kind: "monogram", accent: DEFAULT_ACCENT },
};

/** Text from a text box made safe to store and show: no control characters or line breaks, collapsed spaces, trimmed, cut to length. */
export function cleanLine(value: unknown, max: number): string {
	if (typeof value !== "string") return "";
	return value
		.replace(/[\u0000-\u001f\u007f]+/g, " ")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, max)
		.trim();
}

function normalizeAvatar(value: unknown): Avatar {
	const raw = (value ?? {}) as { kind?: unknown; accent?: unknown; glyph?: unknown };
	if (raw.kind === "glyph" && isGlyphId(raw.glyph)) return { kind: "glyph", glyph: raw.glyph };
	return { kind: "monogram", accent: isAccentId(raw.accent) ? raw.accent : DEFAULT_ACCENT };
}

/** Whatever was in storage (or nothing) made into a valid cover, with a default for anything missing or wrong. */
export function normalizeProfile(value: unknown): Profile {
	const raw = (value ?? {}) as Record<string, unknown>;
	return {
		displayName: cleanLine(raw.displayName, NAME_MAX),
		status: cleanLine(raw.status, STATUS_MAX),
		banner: isBannerId(raw.banner) ? raw.banner : DEFAULT_BANNER,
		avatar: normalizeAvatar(raw.avatar),
	};
}

/** One or two capital letters for a monogram: the first letters of the first and last words ("Ada Lovelace" is "AL"), or "?" with no name. */
export function initialsOf(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return "?";
	const letter = (word: string) => [...word.replace(/^[^\p{L}\p{N}]+/u, "")][0] ?? "";
	const first = letter(words[0]);
	const last = words.length > 1 ? letter(words[words.length - 1]) : "";
	return (first + last).toUpperCase() || "?";
}

/** The name the cover shows: what they chose, else the account's name, else "Guest". */
export function coverName(profile: Profile, fallbackName?: string | null): string {
	return profile.displayName || cleanLine(fallbackName ?? "", NAME_MAX) || "Guest";
}
