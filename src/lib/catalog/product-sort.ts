import { byShuffle } from "./shuffle";

/**
 * How the shop's sort options order products, shared with the home page's collections so they can't drift apart.
 * Only Name A–Z is alphabetical: Featured is fully shuffled; Best Sellers puts flagged bestsellers first; New Arrivals
 * goes by creation time (newest first) but shows each block of `NEWEST_BLOCK` products in a shuffled order, so a page
 * of eight is the eight newest, not alphabetical. Inside those groups, and among equal prices, the order is the seeded
 * shuffle (see shuffle.ts).
 */
export type Sort = "featured" | "best-selling" | "newest" | "name" | "price-asc" | "price-desc";

/** The few fields the sorts look at. */
export type SortableProduct = {
	slug: string;
	name: string;
	price: number;
	/** ISO timestamp the product was created. */
	created: string;
	isBestseller: boolean;
};

/** Alphabetical, ignoring case, with numbers in natural order ("2 mg" before "10 mg"). Only Name A–Z uses it. */
export const byName = (a: { name: string }, b: { name: string }) =>
	a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

/** How many products New Arrivals shuffles together: one shop page, one home collection. */
export const NEWEST_BLOCK = 8;

/** `products` in the order `sort` gives for this shuffle `seed`. Returns a new array. */
export function sortProducts<T extends SortableProduct>(
	products: readonly T[],
	sort: Sort,
	seed: number,
): T[] {
	const shuffled = byShuffle<T>(seed, (p) => p.slug);
	const sorted = [...products];
	switch (sort) {
		case "best-selling":
			return sorted.sort((a, b) => Number(b.isBestseller) - Number(a.isBestseller) || shuffled(a, b));
		case "newest": {
			// Exactly by creation time (a stable tie-break on slug), then shuffle within each block of NEWEST_BLOCK.
			sorted.sort((a, b) => b.created.localeCompare(a.created) || a.slug.localeCompare(b.slug));
			const out: T[] = [];
			for (let i = 0; i < sorted.length; i += NEWEST_BLOCK)
				out.push(...sorted.slice(i, i + NEWEST_BLOCK).sort(shuffled));
			return out;
		}
		case "price-asc":
			return sorted.sort((a, b) => a.price - b.price || shuffled(a, b));
		case "price-desc":
			return sorted.sort((a, b) => b.price - a.price || shuffled(a, b));
		case "name":
			return sorted.sort(byName);
		default:
			return sorted.sort(shuffled);
	}
}
