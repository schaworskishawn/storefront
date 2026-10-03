/**
 * "New Arrivals" is not a Saleor category: a product sits in exactly one category, and new products
 * belong in Hardware, Coils, etc. It is a virtual collection — the newest products in the catalog —
 * resolved wherever the `new-arrivals` slug is used (home/shop tiles, the shop category filter).
 *
 * Kept free of server imports so the client-side shop catalog can use it.
 */
export const NEW_ARRIVALS_SLUG = "new-arrivals";
export const NEW_ARRIVALS_NAME = "New Arrivals";
export const NEW_ARRIVALS_COUNT = 12;

type Dated = { slug: string; created: string };

/** Newest products first, by Saleor `created`. */
export function newestFirst<T extends Dated>(catalog: readonly T[]): T[] {
	return [...catalog].sort((a, b) => b.created.localeCompare(a.created));
}

/** Slugs of the newest `count` products in the catalog. */
export function newArrivalSlugs(catalog: readonly Dated[], count = NEW_ARRIVALS_COUNT): Set<string> {
	return new Set(
		newestFirst(catalog)
			.slice(0, count)
			.map((p) => p.slug),
	);
}
