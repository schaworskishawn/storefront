/**
 * Decisions behind the pointer effects (`PointerFx`): the halo, the magnetic buttons and the click pulses. Kept
 * free of the DOM so they can be tested.
 */

/** How much of the remaining distance each follower closes per frame: the halo is quick, the glow trailing it slower. */
export const HALO_EASE = 0.24;
export const GLOW_EASE = 0.09;

/** A follower this close to its target (in px) has arrived, so the animation loop can rest. */
const ARRIVED_PX = 0.2;

/** At most this many click pulses are on screen at once; a flurry of clicks never piles up. */
export const MAX_PULSES = 6;

export type Point = { x: number; y: number };

/** Moves `from` toward `to` by `ease` of the way. */
export function follow(from: Point, to: Point, ease: number): Point {
	return { x: from.x + (to.x - from.x) * ease, y: from.y + (to.y - from.y) * ease };
}

export function hasArrived(from: Point, to: Point): boolean {
	return Math.abs(to.x - from.x) < ARRIVED_PX && Math.abs(to.y - from.y) < ARRIVED_PX;
}

/** How far a magnetic button drifts toward the pointer at most, in px (sideways, then up and down). */
export const MAGNET_PULL_PX = { x: 5, y: 3 };
/** The button sizes that are magnets. Below the minimum is an icon button; above the maximum is a card (the holographic panels' territory). */
export const MAGNET_SIZE = { minWidth: 64, maxWidth: 420, minHeight: 28, maxHeight: 52 };
/** How wide a rounded corner must be for a button to count (a bare text link has none). */
const MAGNET_MIN_RADIUS = 6;

/** What `PointerFx` reads off an element to decide whether it is a magnetic button. */
export type MagnetFacts = {
	tag: string;
	width: number;
	height: number;
	radius: number;
	bgAlpha: number;
	borderWidth: number;
	borderAlpha: number;
	disabled: boolean;
	hasText: boolean;
	/** Sits inside the page header, or something marked `data-no-magnet`. */
	excluded: boolean;
};

/** A button drawn as a button: a link or button with a label, a rounded filled or outlined surface, and a button's size. */
export function isMagneticTarget(f: MagnetFacts): boolean {
	if (f.excluded || f.disabled || !f.hasText) return false;
	if (f.tag !== "A" && f.tag !== "BUTTON") return false;
	if (f.width < MAGNET_SIZE.minWidth || f.width > MAGNET_SIZE.maxWidth) return false;
	if (f.height < MAGNET_SIZE.minHeight || f.height > MAGNET_SIZE.maxHeight) return false;
	if (f.radius < MAGNET_MIN_RADIUS) return false;
	const filled = f.bgAlpha >= 0.6;
	const outlined = f.borderWidth > 0.5 && f.borderAlpha > 0.2;
	return filled || outlined;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number) => Math.round(value * 100) / 100;

/**
 * Where the pointer is on a button, from -1 (the left or top edge) to 1 (the right or bottom edge) in each direction, with 0 in
 * the middle. The button drifts, and its lettering leans, by this much.
 */
export function magnetOffset(
	rect: { left: number; top: number; width: number; height: number },
	clientX: number,
	clientY: number,
): Point {
	const half = { x: rect.width / 2, y: rect.height / 2 };
	const x = half.x > 0 ? (clientX - (rect.left + half.x)) / half.x : 0;
	const y = half.y > 0 ? (clientY - (rect.top + half.y)) / half.y : 0;
	// `+ 0` turns a -0 into 0.
	return { x: round(clamp(x, -1, 1)) + 0, y: round(clamp(y, -1, 1)) + 0 };
}
