import { BADGE_DRAWINGS } from "./wv-category-badge";
import type { CategoryBadgeIcon } from "./wv-category-art";
import { type LineupItem, NeonLineupArt } from "./wv-neon-lineup-art";

/** Each badge drawing's horizontal centre and its lowest point in its 100 × 100 box, so it can stand on the floor. */
const FOOT: Record<CategoryBadgeIcon, readonly [number, number]> = {
	disposables: [58, 88],
	eliquid: [61, 92],
	hardware: [57, 92],
	coils: [50, 92],
	accessories: [56, 90],
	"new-arrivals": [52, 86],
};

/**
 * The store's range, drawn the same way as the category badges: big enough to read in a frame only 180–240px wide,
 * tallest in the middle and a little larger, the outer ones smaller as if further back.
 */
const LINEUP: readonly LineupItem[] = (
	[
		["accessories", 58, 0.9],
		["disposables", 150, 1.02],
		["eliquid", 240, 1.14],
		["hardware", 330, 1.02],
		["coils", 422, 0.9],
	] as const
).map(([icon, x, scale]) => ({ key: icon, drawing: BADGE_DRAWINGS[icon], foot: FOOT[icon], x, scale }));

/** The shop hero's art: the store's range as a neon lineup on a synthwave grid (wv-neon-lineup-art.tsx). */
export function ShopHeroArt({ idPrefix }: { idPrefix: string }) {
	return <NeonLineupArt idPrefix={idPrefix} lineup={LINEUP} />;
}
