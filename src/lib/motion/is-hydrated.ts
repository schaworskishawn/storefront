/**
 * Whether React has hydrated this element yet. Elements the server sent that React hasn't reached must not be touched: React
 * compares them with what it renders and reports any attribute it did not put there. It marks a hydrated element with a
 * `__reactFiber$…` property.
 */
export const isHydrated = (el: Element): boolean =>
	Object.keys(el).some((key) => key.startsWith("__reactFiber$"));
