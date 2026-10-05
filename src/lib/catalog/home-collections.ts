import { NEWEST_BLOCK, sortProducts, type SortableProduct } from "./product-sort";

/** How many products each home collection shows (one shop page worth). */
export const HOME_SECTION_SIZE = NEWEST_BLOCK;

/** Product ids in the collections staff manage in Saleor Dashboard (Collections). */
export type HomeMembership = {
	staffPicks: readonly string[];
	originals: readonly string[];
	starterKits: readonly string[];
};

export type HomeSections<T> = {
	featured: T[];
	bestSellers: T[];
	staffPicks: T[];
	originals: T[];
	starterKits: T[];
	newArrivals: T[];
};

/**
 * What goes in each home collection for this shuffle `seed`.
 *
 * - Staff Picks, Worldwide Vapor Originals and New to Vaping / Starter Kits show products from the Saleor collections of
 *   those names, in a shuffled order.
 * - New Arrivals are the newest products by creation time, shown shuffled (never alphabetical).
 * - Featured Products are shuffled picks from whatever is left.
 * - Best Sellers are only products actually flagged as bestsellers, so the section stays empty (and hidden) until there
 *   are real ones rather than calling random products "best sellers".
 *
 * A product shows in one collection only, claimed in this order: Best Sellers, New Arrivals, Staff Picks, Starter Kits,
 * Originals, Featured. (The smaller, more specific collections go first so they aren't emptied by the big ones.)
 */
export function buildHomeSections<T extends SortableProduct & { id: string }>(
	products: readonly T[],
	membership: HomeMembership,
	seed: number,
	size = HOME_SECTION_SIZE,
): HomeSections<T> {
	const used = new Set<string>();
	const claim = (list: T[]): T[] => {
		const picked = list.slice(0, size);
		for (const p of picked) used.add(p.id);
		return picked;
	};
	const unclaimed = () => products.filter((p) => !used.has(p.id));
	const members = (ids: readonly string[]) => {
		const set = new Set(ids);
		return () => unclaimed().filter((p) => set.has(p.id));
	};

	const bestSellers = claim(
		sortProducts(
			products.filter((p) => p.isBestseller),
			"best-selling",
			seed,
		),
	);
	const newArrivals = claim(sortProducts(unclaimed(), "newest", seed));
	const staffPicks = claim(sortProducts(members(membership.staffPicks)(), "featured", seed));
	const starterKits = claim(sortProducts(members(membership.starterKits)(), "featured", seed));
	const originals = claim(sortProducts(members(membership.originals)(), "featured", seed));
	const featured = claim(sortProducts(unclaimed(), "featured", seed));

	return { featured, bestSellers, staffPicks, originals, starterKits, newArrivals };
}
