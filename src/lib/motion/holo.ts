/**
 * Decisions behind the holographic hover panels (`HoloPanels`), kept free of the DOM so they can be tested.
 *
 * A "panel" is anything drawn as a card: a rounded surface with a border or shadow and a solid fill. They are found by how
 * they look, not by a class, so every card on the site gets the effect without being tagged one by one.
 */

/** The most a panel tilts toward the pointer, in degrees. */
export const HOLO_MAX_TILT_DEG = 7;

/**
 * Smaller than this is a chip, badge, icon box or button, not a panel. The height sits between the tallest button on the site
 * (49px) and a collapsed accordion row (58px).
 */
export const HOLO_MIN_SIZE = { width: 150, height: 54 };
/** Bigger than this still gets the foil and glow, but doesn't tilt: a wide list or sidebar swinging about looks wrong. */
export const HOLO_MAX_TILT_SIZE = { width: 560, height: 520 };
/**
 * A border at least this thick counts as an edge. Browsers snap a 1px border to whole device pixels, so on a display scaled to
 * 125% or 150%, or a zoomed page, it is reported as 0.8px or 0.67px: a test for "1px or more" would miss real panels.
 */
export const HOLO_MIN_BORDER = 0.5;

/** How wide a rounded corner must be to count as a card's (a button's or a form field's corners are usually smaller). */
export const HOLO_MIN_RADIUS = 10;

const PANEL_TAGS = new Set(["DIV", "ARTICLE", "LI", "ASIDE", "DETAILS", "SECTION", "A", "BUTTON"]);

/** The alpha of a computed CSS colour, whichever form the browser reports it in. "transparent" and unknown forms are 0 and 1. */
export function colorAlpha(css: string): number {
	const value = css.trim().toLowerCase();
	if (value === "" || value === "transparent") return 0;
	const comma = value.match(/^rgba?\(([^)]*)\)$/);
	if (comma && comma[1].includes(",")) {
		const parts = comma[1].split(",");
		return parts.length >= 4 ? clamp01(parseAlpha(parts[3])) : 1;
	}
	const slash = value.match(/\/\s*([\d.]+%?)\s*\)$/);
	return slash ? clamp01(parseAlpha(slash[1])) : 1;
}

function parseAlpha(text: string): number {
	const trimmed = text.trim();
	const number = Number.parseFloat(trimmed);
	if (!Number.isFinite(number)) return 1;
	return trimmed.endsWith("%") ? number / 100 : number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** What `HoloPanels` reads off an element (computed style, box, contents) to decide about it. */
export type PanelFacts = {
	tag: string;
	width: number;
	height: number;
	/** First corner's radius in px. */
	radius: number;
	borderWidth: number;
	borderAlpha: number;
	hasShadow: boolean;
	bgAlpha: number;
	/** Contains a text field, select or text area. */
	hasFields: boolean;
	/** Sits inside the page header, the footer, or something marked `data-no-holo`. */
	excluded: boolean;
};

export type HoloMode = {
	/** The panel also tilts toward the pointer (every panel gets the foil and the glow). */
	tilt: boolean;
};

/** Whether an element is a panel, and if so how much of the effect it gets. Null: leave it alone. */
export function holoMode(f: PanelFacts): HoloMode | null {
	if (f.excluded || !PANEL_TAGS.has(f.tag)) return null;
	if (f.width < HOLO_MIN_SIZE.width || f.height < HOLO_MIN_SIZE.height) return null;
	if (f.radius < HOLO_MIN_RADIUS) return null;
	// A pill or a circle (a rounded-full badge or button) isn't a card, however large.
	if (f.radius >= Math.min(f.width, f.height) / 2 - 1) return null;
	const hasEdge = (f.borderWidth > HOLO_MIN_BORDER && f.borderAlpha > 0.2) || f.hasShadow;
	if (!hasEdge || f.bgAlpha < 0.6) return null;
	const small = f.width <= HOLO_MAX_TILT_SIZE.width && f.height <= HOLO_MAX_TILT_SIZE.height;
	return { tilt: small && !f.hasFields && f.tag !== "DETAILS" };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, places = 1) => Math.round(value * 10 ** places) / 10 ** places;

/**
 * Where the pointer is on a panel, as what the effect needs: the glare's position in percent, and the tilt in degrees. The
 * panel leans so the part under the pointer is pressed away: the pointer on the right edge swings it about the vertical
 * axis (positive `ry`), on the bottom edge about the horizontal axis (negative `rx`).
 */
export function holoPointer(
	rect: { left: number; top: number; width: number; height: number },
	clientX: number,
	clientY: number,
	maxTilt: number = HOLO_MAX_TILT_DEG,
): { x: number; y: number; rx: number; ry: number } {
	const px = rect.width > 0 ? clamp((clientX - rect.left) / rect.width, 0, 1) : 0.5;
	const py = rect.height > 0 ? clamp((clientY - rect.top) / rect.height, 0, 1) : 0.5;
	// `+ 0` turns a -0 into 0.
	return {
		x: round(px * 100),
		y: round(py * 100),
		ry: round((px - 0.5) * 2 * maxTilt) + 0,
		rx: round(-(py - 0.5) * 2 * maxTilt) + 0,
	};
}
