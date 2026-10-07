/**
 * Decisions behind the scroll-reveal layer (`PageMotion`), kept free of the DOM so they can be tested.
 *
 * The layer never hides something the visitor can already see: a block that is on screen when the page first loads has been
 * painted by the server already, so hiding it now would make it flash. It only animates things that are about to appear.
 */

/** "initial": first load, already painted. "navigation": a link was just followed. "idle": anything added later. */
export type RevealMode = "initial" | "navigation" | "idle";

/**
 * "scroll": below the screen, so hide it now and reveal it as it is scrolled to.
 * "enter": on screen in a page that was just navigated to, so play a short entrance with no flash (nothing is painted yet).
 * "skip": leave it alone.
 */
export type RevealPlan = "scroll" | "enter" | "skip";

export function planReveal(
	rect: { top: number; bottom: number },
	viewportHeight: number,
	mode: RevealMode,
): RevealPlan {
	if (rect.top >= viewportHeight) return "scroll";
	if (rect.bottom <= 0) return "skip";
	return mode === "navigation" ? "enter" : "skip";
}

/** Whether a block is worth animating: it takes up room and sits in the normal flow (not a backdrop, bar or overlay). */
export function isRevealable(style: { position: string; display: string }, height: number): boolean {
	if (style.display === "none" || style.display === "contents") return false;
	if (style.position === "absolute" || style.position === "fixed" || style.position === "sticky")
		return false;
	return height >= 8;
}

export const STAGGER_STEP_MS = 70;
export const STAGGER_MAX_STEPS = 5;

/** Delay for the nth item revealed in the same moment, so a row of cards cascades instead of popping together. */
export function staggerDelay(index: number): number {
	const step = Math.min(Math.max(Math.floor(index), 0), STAGGER_MAX_STEPS);
	return step * STAGGER_STEP_MS;
}
