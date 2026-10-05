/**
 * The connected Saleor Cloud catalog's actual category slugs are leftover demo/seed data
 * (juices, t-shirts, sneakers, audiobooks-2, polo-shirts-2, sunglasses) — not Worldwide Vapor's
 * real taxonomy, and not what the Figma-designed category artwork expects (see
 * `wv-category-art.ts` in the storefront UI layer, whose keys were always the *intended* slugs
 * below — the art has been silently failing to match this whole time).
 *
 * Remapped once here, at the data layer, so every consumer (category tiles, shop filters,
 * breadcrumbs, search, wishlist grouping) sees the real slugs/names without needing to know
 * about the underlying demo data — see every call site of `HomeProduct.categorySlug`/`.brand`.
 *
 * TODO: once real categories exist in Saleor (Dashboard → Catalog → Categories, renamed/re-slugged
 * to match the keys below), delete this file and its one call site in `get-home-products.ts` —
 * the data will already be correct at the source.
 */
const CATEGORY_SLUG_REMAP: Record<string, string> = {
	juices: "disposables",
	"t-shirts": "e-liquids",
	sneakers: "hardware",
	"audiobooks-2": "coils",
	"polo-shirts-2": "accessories",
	sunglasses: "new-arrivals",
};

const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
	disposables: "Disposables",
	"e-liquids": "E-Liquid",
	ejuice: "E-Liquid",
	hardware: "Hardware",
	coils: "Coils",
	accessories: "Accessories",
	"new-arrivals": "New Arrivals",
};

/** Real Saleor category slug (e.g. "juices") -> the intended slug (e.g. "disposables"). */
export function remapCategorySlug(slug: string): string {
	return CATEGORY_SLUG_REMAP[slug] ?? slug;
}

/** Real Saleor category slug -> the customer-facing display name, e.g. "juices" -> "Disposables". */
export function remapCategoryName(slug: string, fallbackName: string): string {
	const canonicalSlug = remapCategorySlug(slug);
	return CATEGORY_DISPLAY_NAMES[canonicalSlug] ?? fallbackName;
}
