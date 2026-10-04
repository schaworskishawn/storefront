/**
 * Shop filter facets: the few product attributes the shop sidebar filters on, read off a product's Saleor
 * attributes, variant options and product type. Pure (no server imports) so the client-side shop can use the types.
 */
export type FacetKey =
	| "brand"
	| "battery-capacity"
	| "e-liquid-capacity"
	| "flavor-profile"
	| "puff-count"
	| "nicotine-strength"
	| "bottle-size"
	| "type";

/** Facet values of one product, e.g. `{ brand: ["Waka"], "puff-count": ["20K"], type: ["Disposables"] }`. */
export type Facets = Partial<Record<FacetKey, string[]>>;

type NamedValues = { attribute: { slug: string }; values: readonly { name?: string | null }[] };

const namesOf = (a: NamedValues): string[] => a.values.flatMap((v) => (v.name ? [v.name] : []));

export type FacetSource = {
	productType?: { name: string } | null;
	attributes?: readonly NamedValues[] | null;
	variants?: readonly { attributes?: readonly NamedValues[] | null }[] | null;
};

/** Product-level attribute slug -> facet. */
const PRODUCT_ATTRIBUTE_FACETS: Record<string, FacetKey> = {
	brand: "brand",
	"battery-capacity": "battery-capacity",
	"e-liquid-capacity": "e-liquid-capacity",
	"flavor-profile": "flavor-profile",
	"puff-count": "puff-count",
	// Disposables also list their strengths on the product; E-Juice only has them on its variants (below).
	"nicotine-strength": "nicotine-strength",
};

/** Variant option slug -> facet (a product matches when any of its variants does). */
const VARIANT_ATTRIBUTE_FACETS: Record<string, FacetKey> = {
	"nicotine-strength-variant": "nicotine-strength",
	"bottle-size-variant": "bottle-size",
};

const add = (facets: Facets, key: FacetKey, values: readonly string[]) => {
	if (values.length === 0) return;
	const merged = new Set([...(facets[key] ?? []), ...values]);
	facets[key] = [...merged];
};

export function extractFacets(source: FacetSource): Facets {
	const facets: Facets = {};
	for (const a of source.attributes ?? []) {
		const key = PRODUCT_ATTRIBUTE_FACETS[a.attribute.slug];
		if (key) add(facets, key, namesOf(a));
	}
	for (const variant of source.variants ?? []) {
		for (const a of variant.attributes ?? []) {
			const key = VARIANT_ATTRIBUTE_FACETS[a.attribute.slug];
			if (key) add(facets, key, namesOf(a));
		}
	}
	if (source.productType?.name) add(facets, "type", [source.productType.name]);
	return facets;
}
