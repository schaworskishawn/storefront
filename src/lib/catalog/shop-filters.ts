import type { FacetKey, Facets } from "./product-facets";

/**
 * Shop sidebar filters. Two kinds:
 * - Attribute groups (Brand, Puff Count, …): collapsible groups listed under their category heading (Disposables, E-Liquid).
 *   Within a group a product matches any ticked value; across groups it must match all of them.
 * - Sub-categories (Hardware > Pod Mods, Accessories > Chargers, …): the product types, listed under their category
 *   heading too. Within a category, ticked sub-categories narrow it; a category with none ticked shows everything.
 * Ticked values only ever narrow the category they sit under; other categories are unaffected.
 * Pure, so the client-side shop can use it.
 */
export type FilterOption = { label: string; value: string };

export type FilterGroup = {
	id: string;
	label: string;
	key: FacetKey;
	/** Catalog-derived options in numeric order (by the leading number: "20K", "650 mAh", "20 mg/mL"). */
	sort?: "asc" | "desc";
	/** Catalog-derived options in this order first; any others follow alphabetically. */
	order?: readonly string[];
};

export type FilterOptionCount = FilterOption & { count: number };
export type FacetSelection = Partial<Record<FacetKey, string[]>>;
/** Ticked attribute values per category slug. */
export type CategoryFacetSelection = Record<string, FacetSelection>;

/** A run of sub-categories under a category, optionally under its own small heading (Hardware: Mods, Atomizers). */
export type SubcategoryGroup = { label?: string; options: readonly FilterOption[] };

const BRAND: FilterGroup = { id: "brand", label: "Brand", key: "brand" };
const NICOTINE: FilterGroup = {
	id: "nicotine-strength",
	label: "Nicotine Strength",
	key: "nicotine-strength",
	sort: "desc",
};
const FLAVOR: FilterGroup = {
	id: "flavor-profile",
	label: "Flavor Profile",
	key: "flavor-profile",
	order: ["Taffy", "Slushies", "Donuts", "Custards", "Fruit", "Ice", "Mint"],
};

/** Attribute groups per category slug. A category listed with no groups has none (only its sub-categories). */
export const CATEGORY_FILTER_GROUPS: Record<string, readonly FilterGroup[]> = {
	disposables: [
		{ id: "battery-capacity", label: "Battery Capacity", key: "battery-capacity", sort: "asc" },
		{
			...BRAND,
			order: [
				"Worldwide Vapor",
				"Drip'n by Envi",
				"Stlth X Geek Bar",
				"Waka",
				"Vice X Nexa",
				"Oxbar",
				"Kraze",
			],
		},
		{ id: "e-liquid-capacity", label: "E-Liquid Capacity", key: "e-liquid-capacity", sort: "asc" },
		FLAVOR,
		NICOTINE,
		{ id: "puff-count", label: "Puff Count", key: "puff-count", sort: "asc" },
	],
	ejuice: [
		{
			...BRAND,
			order: [
				"Geek Bar",
				"Worldwide Vapor",
				"Flavor Beast",
				"Flavour Beast",
				"Flavour Beast x 12 Monkey",
				"Flavour Beast x 12 Monkeys",
			],
		},
		{ id: "bottle-size", label: "Bottle Size", key: "bottle-size", sort: "asc" },
		NICOTINE,
		FLAVOR,
	],
	hardware: [],
	coils: [],
	accessories: [],
};
// Legacy slugs the E-Juice category has had (see category-map.ts).
CATEGORY_FILTER_GROUPS["e-liquids"] = CATEGORY_FILTER_GROUPS.ejuice;
CATEGORY_FILTER_GROUPS["e-liquid"] = CATEGORY_FILTER_GROUPS.ejuice;

const types = (...pairs: [label: string, value: string][]): FilterOption[] =>
	pairs.map(([label, value]) => ({ label, value }));

/** Sub-categories per category slug. Values are Saleor product type names; labels are what shoppers see. Types with
 *  no products yet (e.g. "Pods") stay hidden until they have some. */
export const CATEGORY_SUBCATEGORIES: Record<string, readonly SubcategoryGroup[]> = {
	hardware: [
		{
			label: "Mods",
			options: types(
				["Pod Systems", "Pod System"],
				["Pod Mods", "Pod Mod"],
				["Box Mods", "Box Mod"],
				["Mechanical Mods", "Mechanical Mod"],
				["Squonk Mods", "Squonk Mod"],
			),
		},
		{
			label: "Atomizers",
			options: types(
				["Sub-ohm Tanks", "Sub-Ohm Tanks"],
				["MTL Tanks", "MTL Tanks"],
				["RTA", "RTA"],
				["RDA", "RDA"],
				["RDTA", "RDTA"],
				["Boro Tanks", "Boro Tanks"],
			),
		},
	],
	coils: [{ options: types(["Cartridges", "Cartridges"], ["Coils", "Coils"], ["Pods", "Pods"]) }],
	accessories: [
		{
			options: types(
				["Wire", "Prebuilt Wire"],
				["Chargers", "Charger"],
				["Battery Case 18650", "Battery Case"],
				["Cotton", "Cotton"],
				["Batteries", "Batteries"],
				["Drip Tips", "Drip Tips"],
				["Tool Kits", "Tool Kit"],
				["Adapters", "Adapters"],
				["Battery Wrappers", "Battery Wrappers"],
				["Squonk Bottle", "Squonk Bottle"],
			),
		},
	],
};

/** Which category a product type belongs to (types are unique to one category). */
const TYPE_OWNER = new Map<string, string>(
	Object.entries(CATEGORY_SUBCATEGORIES).flatMap(([category, groups]) =>
		groups.flatMap((g) => g.options.map((o): [string, string] => [o.value, category])),
	),
);

export function categoryOfType(typeValue: string): string | undefined {
	return TYPE_OWNER.get(typeValue);
}

/** Attribute groups listed under a category heading (none for categories that only have sub-categories). */
export function filterGroupsFor(categorySlug: string): readonly FilterGroup[] {
	return CATEGORY_FILTER_GROUPS[categorySlug] ?? [];
}

/** Does a product's facets satisfy the selection? Any ticked value within a facet, every ticked facet overall. */
export function matchesFacets(facets: Facets, selection: FacetSelection): boolean {
	for (const [key, wanted] of Object.entries(selection) as [FacetKey, string[]][]) {
		if (wanted.length === 0) continue;
		const have = facets[key];
		if (!have || !wanted.some((value) => have.includes(value))) return false;
	}
	return true;
}

/** Applies only the values ticked under the product's own category; products in other categories are unaffected. */
export function matchesCategoryFacets(
	product: { categorySlug: string | null; facets: Facets },
	selection: CategoryFacetSelection,
): boolean {
	return matchesFacets(product.facets, (product.categorySlug && selection[product.categorySlug]) || {});
}

/**
 * Does a product satisfy the ticked sub-categories? Only the ones in the product's own category count: if none of
 * those are ticked the product is not narrowed at all, otherwise its product type must be one of them.
 */
export function matchesSubcategories(
	product: { categorySlug: string | null; facets: Facets },
	ticked: readonly string[],
): boolean {
	if (ticked.length === 0 || product.categorySlug === null) return true;
	const own = ticked.filter((value) => TYPE_OWNER.get(value) === product.categorySlug);
	if (own.length === 0) return true;
	return (product.facets.type ?? []).some((type) => own.includes(type));
}

const leadingNumber = (value: string) => {
	const n = Number.parseFloat(value);
	return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n;
};

/** The options of one attribute group with how many of `scope`'s products have each; options nobody has are left out. */
export function groupOptions(group: FilterGroup, scope: readonly { facets: Facets }[]): FilterOptionCount[] {
	const counts = new Map<string, number>();
	for (const product of scope) {
		for (const value of product.facets[group.key] ?? []) counts.set(value, (counts.get(value) ?? 0) + 1);
	}

	const rank = (value: string) => {
		const i = group.order?.indexOf(value) ?? -1;
		return i === -1 ? Number.POSITIVE_INFINITY : i;
	};
	return [...counts]
		.map(([value, count]) => ({ label: value, value, count }))
		.sort((a, b) => {
			if (group.sort) {
				const na = leadingNumber(a.value);
				const nb = leadingNumber(b.value);
				if (na !== nb) return group.sort === "asc" ? na - nb : nb - na;
			}
			if (group.order && rank(a.value) !== rank(b.value)) return rank(a.value) - rank(b.value);
			return a.label.localeCompare(b.label);
		});
}

/** How many of `products` (a category's products) have each sub-category; sub-categories nobody has are left out. */
export function subcategoryOptions(
	groups: readonly SubcategoryGroup[],
	products: readonly { facets: Facets }[],
): { label?: string; options: FilterOptionCount[] }[] {
	const counts = new Map<string, number>();
	for (const product of products) {
		for (const type of product.facets.type ?? []) counts.set(type, (counts.get(type) ?? 0) + 1);
	}
	return groups
		.map((group) => ({
			label: group.label,
			options: group.options
				.map((o) => ({ ...o, count: counts.get(o.value) ?? 0 }))
				.filter((o) => o.count > 0),
		}))
		.filter((group) => group.options.length > 0);
}
