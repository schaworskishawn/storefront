import { NEW_ARRIVALS_SLUG, newArrivalSlugs } from "./new-arrivals";
import type { Facets } from "./product-facets";
import { type CategoryFacetSelection, matchesCategoryFacets, matchesSubcategories } from "./shop-filters";

/**
 * What the shop sidebar can narrow a product list by, shared by the shop and the search page. Pure (no React, no server
 * imports), so both client components and the unit tests use it.
 */
export type ShopFilterSelection = {
	/** Ticked categories: real category slugs plus the virtual New Arrivals (see new-arrivals.ts). */
	cats: string[];
	/** Price range, or null while the slider spans every price, so a catalog that grows never leaves a stale price filter. */
	range: [number, number] | null;
	/** Ticked attribute values per category (Disposables > Puff Count > 20K, …). */
	facets: CategoryFacetSelection;
	/** Ticked sub-categories (product types), e.g. "Pod Mod", "Charger". */
	types: string[];
};

/** The few fields the filters look at. */
export type FilterableProduct = {
	slug: string;
	categorySlug: string | null;
	price: number;
	/** ISO timestamp the product was created (New Arrivals). */
	created: string;
	facets: Facets;
};

/** Nothing ticked. A fresh object each call, so callers can never share (and mutate) one. */
export function emptyShopFilters(): ShopFilterSelection {
	return { cats: [], range: null, facets: {}, types: [] };
}

/** Does the selection narrow anything at all? */
export function hasShopFilters(selection: ShopFilterSelection): boolean {
	return (
		selection.cats.length > 0 ||
		selection.range !== null ||
		selection.types.length > 0 ||
		Object.values(selection.facets).some((groups) =>
			Object.values(groups).some((values) => values.length > 0),
		)
	);
}

/**
 * `products` narrowed by the selection, in their original order.
 *
 * Real categories combine with "or"; New Arrivals then narrows whatever they select to its newest products (so
 * "Hardware + New Arrivals" is the newest hardware, and New Arrivals alone spans every category). Attribute values and
 * sub-categories only narrow the category they sit under; the price range is inclusive at both ends.
 */
export function applyShopFilters<T extends FilterableProduct>(
	products: readonly T[],
	selection: ShopFilterSelection,
): T[] {
	const realCats = selection.cats.filter((slug) => slug !== NEW_ARRIVALS_SLUG);
	const inCategories =
		realCats.length === 0
			? products
			: products.filter((p) => p.categorySlug !== null && realCats.includes(p.categorySlug));
	const newestHere = selection.cats.includes(NEW_ARRIVALS_SLUG) ? newArrivalSlugs(inCategories) : null;
	const { range } = selection;
	return inCategories.filter(
		(p) =>
			(newestHere === null || newestHere.has(p.slug)) &&
			matchesCategoryFacets(p, selection.facets) &&
			matchesSubcategories(p, selection.types) &&
			(range === null || (p.price >= range[0] && p.price <= range[1])),
	);
}

/** The cheapest and dearest price in whole dollars: the extremes of the price slider. {0, 0} for no products. */
export type PriceBounds = { min: number; max: number };

export function priceBounds(products: readonly { price: number }[]): PriceBounds {
	if (products.length === 0) return { min: 0, max: 0 };
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	for (const { price } of products) {
		min = Math.min(min, price);
		max = Math.max(max, price);
	}
	return { min: Math.floor(min), max: Math.ceil(max) };
}

/** The slider thumbs for a range: clamped into the bounds (they may have changed since the thumbs were dragged). */
export function clampRange(range: readonly [number, number] | null, bounds: PriceBounds): [number, number] {
	const lo = Math.min(Math.max(range?.[0] ?? bounds.min, bounds.min), bounds.max);
	const hi = Math.min(Math.max(range?.[1] ?? bounds.max, lo), bounds.max);
	return [lo, hi];
}

/** The range to filter by: null when the thumbs span the whole bounds, otherwise the clamped thumbs. */
export function normalizeRange(
	range: readonly [number, number] | null,
	bounds: PriceBounds,
): [number, number] | null {
	const [lo, hi] = clampRange(range, bounds);
	return lo === bounds.min && hi === bounds.max ? null : [lo, hi];
}
