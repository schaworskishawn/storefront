/**
 * "My Desk": a visitor's own little dashboard and profile cover, kept only in their browser. This is the data shape, the rules for
 * cleaning anything read back from storage (it can be missing, old, or edited by hand), and the pure operations the screen uses
 * (moving panels, adding shortcuts). No DOM and no React, so all of it is tested.
 */

// ----- Panels -----

export const PANEL_IDS = ["shortcuts", "notes", "clock", "appearance"] as const;
export type PanelId = (typeof PANEL_IDS)[number];
export const DEFAULT_PANELS: PanelId[] = [...PANEL_IDS];

const isPanelId = (value: unknown): value is PanelId => PANEL_IDS.includes(value as PanelId);

/**
 * A saved order made whole: unknown ids dropped, repeats dropped, and any panel missing from it put back at the end, so a desk
 * saved before a panel existed (or tampered with) still shows every panel exactly once.
 */
export function normalizePanels(value: unknown): PanelId[] {
	const seen = new Set<PanelId>();
	if (Array.isArray(value)) for (const item of value) if (isPanelId(item)) seen.add(item);
	for (const id of PANEL_IDS) seen.add(id);
	return [...seen];
}

/** Moves a panel one place earlier (-1) or later (1); at either end it stays where it is. */
export function movePanel(order: readonly PanelId[], id: PanelId, step: -1 | 1): PanelId[] {
	const from = order.indexOf(id);
	const to = from + step;
	if (from < 0 || to < 0 || to >= order.length) return [...order];
	const next = [...order];
	[next[from], next[to]] = [next[to], next[from]];
	return next;
}

/** Drops `from` into the place `to` holds (what dragging one panel onto another does); the panels between slide along. */
export function reorderPanel(order: readonly PanelId[], from: PanelId, to: PanelId): PanelId[] {
	const fromIndex = order.indexOf(from);
	const toIndex = order.indexOf(to);
	if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return [...order];
	const next = [...order];
	next.splice(fromIndex, 1);
	next.splice(toIndex, 0, from);
	return next;
}

// ----- Accents -----

/** The colour a visitor can give their desk. `hsl` is the main colour; `ink` is readable text on top of it. */
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

// ----- Profile (the cover) -----

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

// ----- Shortcuts -----

export const SHORTCUT_MAX = 12;
export const SHORTCUT_LABEL_MAX = 24;

export type Shortcut = { id: string; label: string; href: string };

/** Places on the site a new desk starts with. */
export const DEFAULT_SHORTCUTS: Shortcut[] = [
	{ id: "shop", label: "Shop", href: "/shop" },
	{ id: "orders", label: "My orders", href: "/orders" },
	{ id: "wishlist", label: "Wishlist", href: "/wishlist" },
	{ id: "contact", label: "Contact us", href: "/contact-us" },
];

/**
 * A shortcut's address made safe to link to: a path on this site (`/shop`), or a web address (https or http). Anything else
 * (`javascript:`, `data:`, a path that is really another site's `//host`) is refused, since a visitor can type anything.
 */
export function cleanHref(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const href = value.trim();
	if (href.length === 0 || href.length > 300) return null;
	if (/[\u0000-\u001f\u007f\s]/.test(href)) return null;
	if (href.startsWith("/")) return href.startsWith("//") || href.includes("\\") ? null : href;
	try {
		const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(href) ? href : `https://${href}`);
		if (url.protocol !== "https:" && url.protocol !== "http:") return null;
		return url.hostname.includes(".") ? url.toString() : null;
	} catch {
		return null;
	}
}

export const isExternalHref = (href: string) => !href.startsWith("/");

export type ShortcutResult = { ok: true; shortcuts: Shortcut[] } | { ok: false; error: string };

/** Adds a shortcut, or says why not. The id is passed in so the result is predictable (and the caller makes it unique). */
export function addShortcut(
	shortcuts: readonly Shortcut[],
	input: { label: string; href: string },
	id: string,
): ShortcutResult {
	const label = cleanLine(input.label, SHORTCUT_LABEL_MAX);
	if (!label) return { ok: false, error: "Give the shortcut a name." };
	const href = cleanHref(input.href);
	if (!href) return { ok: false, error: "That doesn't look like a page on this site or a web address." };
	if (shortcuts.length >= SHORTCUT_MAX) {
		return { ok: false, error: `You can keep up to ${SHORTCUT_MAX} shortcuts. Remove one first.` };
	}
	if (shortcuts.some((s) => s.href === href))
		return { ok: false, error: "That one is already on your desk." };
	return { ok: true, shortcuts: [...shortcuts, { id, label, href }] };
}

function normalizeShortcuts(value: unknown): Shortcut[] {
	if (!Array.isArray(value)) return DEFAULT_SHORTCUTS.map((s) => ({ ...s }));
	const out: Shortcut[] = [];
	const ids = new Set<string>();
	for (const item of value) {
		const raw = (item ?? {}) as Record<string, unknown>;
		const label = cleanLine(raw.label, SHORTCUT_LABEL_MAX);
		const href = cleanHref(raw.href);
		const id = typeof raw.id === "string" && raw.id.length <= 40 && !ids.has(raw.id) ? raw.id : null;
		if (label && href && id && out.length < SHORTCUT_MAX) {
			ids.add(id);
			out.push({ id, label, href });
		}
	}
	return out;
}

// ----- The whole desk -----

export const NOTES_MAX = 5000;

export type Appearance = {
	accent: AccentId;
	/** The cursor halo, click pulses, magnetic buttons and panel shimmer. */
	effects: boolean;
	compact: boolean;
};

export type DeskState = {
	profile: Profile;
	panels: PanelId[];
	notes: string;
	shortcuts: Shortcut[];
	clock24: boolean;
	appearance: Appearance;
};

export const DEFAULT_DESK: DeskState = {
	profile: DEFAULT_PROFILE,
	panels: DEFAULT_PANELS,
	notes: "",
	shortcuts: DEFAULT_SHORTCUTS,
	clock24: false,
	appearance: { accent: DEFAULT_ACCENT, effects: true, compact: false },
};

/** Whatever was in storage (or nothing) made into a valid desk, with a default for anything missing or wrong. */
export function normalizeDesk(value: unknown): DeskState {
	const raw = (value ?? {}) as Record<string, unknown>;
	const appearance = (raw.appearance ?? {}) as Record<string, unknown>;
	return {
		profile: normalizeProfile(raw.profile),
		panels: normalizePanels(raw.panels),
		// Notes keep their line breaks, unlike a one-line field.
		notes: typeof raw.notes === "string" ? raw.notes.slice(0, NOTES_MAX) : "",
		shortcuts: normalizeShortcuts(raw.shortcuts),
		clock24: raw.clock24 === true,
		appearance: {
			accent: isAccentId(appearance.accent) ? appearance.accent : DEFAULT_ACCENT,
			effects: appearance.effects !== false,
			compact: appearance.compact === true,
		},
	};
}

/** The name the cover shows: what they chose, else the account's name, else "Guest". */
export function coverName(profile: Profile, fallbackName?: string | null): string {
	return profile.displayName || cleanLine(fallbackName ?? "", NAME_MAX) || "Guest";
}
