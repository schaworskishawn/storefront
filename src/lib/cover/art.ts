import { accentFor, type AccentId, type BannerId, type GlyphId } from "./model";

/**
 * The look of the cover choices: abstract banners drawn in pure CSS (no image files), and the avatar pictures. Colour data, kept
 * out of the components on purpose (the design-token check only polices component styling).
 */

export const BANNERS: Record<BannerId, { label: string; css: string }> = {
	aurora: {
		label: "Aurora",
		css: "radial-gradient(60% 120% at 15% 0%, hsl(185 100% 50% / 0.55), transparent 60%), radial-gradient(70% 120% at 90% 20%, hsl(320 100% 65% / 0.5), transparent 60%), linear-gradient(120deg, hsl(255 70% 14%), hsl(270 80% 22%) 55%, hsl(235 70% 12%))",
	},
	grid: {
		label: "Neon grid",
		css: "linear-gradient(hsl(185 100% 60% / 0.22) 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(90deg, hsl(185 100% 60% / 0.22) 1px, transparent 1px) 0 0 / 28px 28px, radial-gradient(80% 140% at 50% 120%, hsl(300 100% 60% / 0.45), transparent 60%), linear-gradient(180deg, hsl(250 60% 8%), hsl(265 70% 16%))",
	},
	sunset: {
		label: "Sunset",
		css: "repeating-linear-gradient(0deg, transparent 0 6px, hsl(0 0% 0% / 0.18) 6px 8px), linear-gradient(180deg, hsl(260 70% 14%) 0%, hsl(300 80% 36%) 45%, hsl(335 95% 58%) 70%, hsl(40 100% 60%) 100%)",
	},
	waves: {
		label: "Waves",
		css: "radial-gradient(120% 90% at 0% 100%, hsl(185 100% 45% / 0.6) 0 30%, transparent 31%), radial-gradient(120% 90% at 100% 100%, hsl(300 100% 62% / 0.55) 0 34%, transparent 35%), radial-gradient(150% 110% at 50% 110%, hsl(270 90% 50% / 0.6) 0 40%, transparent 41%), linear-gradient(180deg, hsl(240 60% 10%), hsl(262 70% 18%))",
	},
	circuit: {
		label: "Circuit",
		css: "repeating-linear-gradient(45deg, hsl(185 100% 60% / 0.12) 0 2px, transparent 2px 18px), radial-gradient(circle at 20% 30%, hsl(185 100% 65% / 0.7) 0 2px, transparent 3px), radial-gradient(circle at 70% 60%, hsl(300 100% 72% / 0.7) 0 2px, transparent 3px), radial-gradient(circle at 88% 25%, hsl(55 100% 65% / 0.7) 0 2px, transparent 3px), linear-gradient(135deg, hsl(250 60% 9%), hsl(275 70% 20%))",
	},
	nebula: {
		label: "Nebula",
		css: "radial-gradient(40% 70% at 20% 30%, hsl(300 100% 60% / 0.5), transparent 70%), radial-gradient(45% 80% at 75% 60%, hsl(185 100% 50% / 0.45), transparent 70%), radial-gradient(30% 60% at 55% 15%, hsl(265 90% 60% / 0.55), transparent 70%), linear-gradient(180deg, hsl(250 60% 7%), hsl(260 55% 11%))",
	},
};

export const GLYPHS: Record<GlyphId, { label: string; emoji: string }> = {
	bolt: { label: "Lightning bolt", emoji: "⚡" },
	swirl: { label: "Swirl", emoji: "🌀" },
	fire: { label: "Flame", emoji: "🔥" },
	alien: { label: "Pixel alien", emoji: "👾" },
	rocket: { label: "Rocket", emoji: "🚀" },
	unicorn: { label: "Unicorn", emoji: "🦄" },
	headphones: { label: "Headphones", emoji: "🎧" },
	flask: { label: "Flask", emoji: "🧪" },
};

/** The main colour of an accent as a CSS colour, and the text colour that reads on it. */
export function accentColors(id: AccentId): { color: string; ink: string } {
	const accent = accentFor(id);
	return { color: `hsl(${accent.hsl})`, ink: accent.ink };
}
