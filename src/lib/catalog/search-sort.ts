import { byShuffle } from "./shuffle";

/**
 * How the search page orders its results. "Relevance" puts the best matches first and shuffles products that match
 * equally well, so with no search words (every product ties) the page is as random as the shop's Featured sort, and a
 * word keeps its best matches on top. Equal prices are shuffled too. The shuffle is the shop's (see shuffle.ts): the
 * same seed gives the same order, so the results stay put while the shopper filters or pages.
 */
export type SearchSort = "relevance" | "price-asc" | "price-desc" | "newest" | "name";

/** The few fields the sorts look at. */
type SearchSortable = { slug: string; name: string; price: number; created: string };

/** `products` in the order `sort` gives for this shuffle `seed`; `relevance` scores a product (higher is better). */
export function sortSearchResults<T extends SearchSortable>(
	products: readonly T[],
	sort: SearchSort,
	relevance: (product: T) => number,
	seed: number,
): T[] {
	const shuffled = byShuffle<T>(seed, (p) => p.slug);
	const sorted = [...products];
	switch (sort) {
		case "relevance":
			return sorted.sort((a, b) => relevance(b) - relevance(a) || shuffled(a, b));
		case "price-asc":
			return sorted.sort((a, b) => a.price - b.price || shuffled(a, b));
		case "price-desc":
			return sorted.sort((a, b) => b.price - a.price || shuffled(a, b));
		case "newest":
			return sorted.sort((a, b) => b.created.localeCompare(a.created));
		case "name":
			return sorted.sort((a, b) => a.name.localeCompare(b.name));
	}
}
