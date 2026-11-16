import { type LineupDrawing, type LineupItem, NeonLineupArt } from "./wv-neon-lineup-art";

/**
 * The Learn hero's art: the same neon synthwave scene as the shop hero (wv-neon-lineup-art.tsx), but its lineup is what
 * the Learn page holds, one drawing per category chip below it: a lightbulb for tips, an article for news, an open book
 * for guides in the middle, a star with its rating for reviews, and a mortarboard for beginners. Drawn in the badges'
 * format (100 × 100 box), so they read as one set with the store's art.
 */

type LearnArt = "tips" | "news" | "guides" | "reviews" | "beginners";

const DRAWINGS: Record<LearnArt, LineupDrawing & { foot: readonly [number, number] }> = {
	// A lightbulb: the glass, its filament on two stems, the screw base with a thread, and rays.
	tips: {
		strokes: [
			"M50 14 C32 14 22 28 22 42 C22 54 30 60 36 68 L36 74 L64 74 L64 68 C70 60 78 54 78 42 C78 28 68 14 50 14 Z",
			"M43 68 L43 54 M57 68 L57 54",
			"M43 54 C45 48 47 60 50 54 C53 48 55 60 57 54",
			"M38 74 L62 74 L62 84 Q62 90 56 90 L44 90 Q38 90 38 84 Z",
			"M38 81 L62 81",
			"M14 22 L8 17",
			"M86 22 L92 17",
			"M10 42 L3 42",
			"M90 42 L97 42",
		],
		foot: [50, 90],
	},
	// An article: a page with its corner folded over, a headline, a picture and lines of text.
	news: {
		strokes: [
			"M26 18 L62 18 L76 32 L76 86 Q76 92 70 92 L32 92 Q26 92 26 86 Z",
			"M62 18 L62 32 L76 32",
			"M34 32 L54 32",
			"M34 42 L68 42 L68 60 L34 60 Z",
			"M34 70 L68 70",
			"M34 79 L58 79",
		],
		foot: [51, 92],
	},
	// An open book, its pages lined with text, on its cover, with a spark rising from it.
	guides: {
		strokes: [
			"M50 34 C40 26 26 24 12 28 L12 80 C26 76 40 78 50 86 Z",
			"M50 34 C60 26 74 24 88 28 L88 80 C74 76 60 78 50 86 Z",
			"M7 34 L7 86 C24 82 40 84 50 92 C60 84 76 82 93 86 L93 34",
			"M20 40 C28 38 36 39 42 43",
			"M20 50 C28 48 36 49 42 53",
			"M20 60 C28 58 36 59 42 63",
			"M58 43 C64 39 72 38 80 40",
			"M58 53 C64 49 72 48 80 50",
			"M58 63 C64 59 72 58 80 60",
			"M50 2 C51 9 53 11 59 12 C53 13 51 15 50 22 C49 15 47 13 41 12 C47 11 49 9 50 2 Z",
		],
		foot: [50, 92],
	},
	// A five-pointed star over a row of rating dots.
	reviews: {
		strokes: [
			"M50 14 L58.2 37.7 L83.3 38.5 L63.3 53.3 L70.6 77.3 L50 63 L29.4 77.3 L36.7 53.3 L16.7 38.5 L41.8 37.7 Z",
		],
		dots: [28, 39, 50, 61, 72].map((cx) => `M${cx} 89 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0`),
		foot: [50, 92],
	},
	// A mortarboard: the board, the cap beneath it, and the tassel.
	beginners: {
		strokes: [
			"M50 28 L92 45 L50 62 L8 45 Z",
			"M25 54 L25 72 Q50 88 75 72 L75 54",
			"M50 45 L84 52 L84 70",
			"M80 70 L88 70 L86 82 L82 82 Z",
		],
		foot: [50, 82],
	},
};

/** Tallest in the middle and a little larger, the outer ones smaller as if further back (as in the shop's lineup). */
const LINEUP: readonly LineupItem[] = (
	[
		["tips", 58, 0.9],
		["news", 150, 1.02],
		["guides", 240, 1.14],
		["reviews", 330, 1.02],
		["beginners", 422, 0.9],
	] as const
).map(([art, x, scale]) => {
	const { foot, ...drawing } = DRAWINGS[art];
	return { key: art, drawing, foot, x, scale };
});

/** In the hero's wide frame below the desktop layout, the lineup stays in view and the sky is cropped (`focus="floor"`). */
export function LearnHeroArt({ idPrefix }: { idPrefix: string }) {
	return <NeonLineupArt idPrefix={idPrefix} lineup={LINEUP} focus="floor" />;
}
