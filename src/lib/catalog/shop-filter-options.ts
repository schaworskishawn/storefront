import type { ShopFilterSelection } from "./apply-shop-filters";
import { categoryRank } from "./category-order";
import { NEW_ARRIVALS_NAME, NEW_ARRIVALS_SLUG, newArrivalSlugs } from "./new-arrivals";
import type { Facets, FacetKey } from "./product-facets";
import type { ActiveFilter } from "./shop-filter-state";
import {
	CATEGORY_FILTER_GROUPS,
	CATEGORY_SUBCATEGORIES,
	type FilterOptionCount,
	filterGroupsFor,
	groupOptions,
	subcategoryOptions,
} from "./shop-filters";

/**
 * What the shop sidebar lists, derived from whichever products it is filtering: the shop passes the whole catalog,
 * the search page only the products matching the search words, so counts and sub-filters follow the search.
 * Pure, so it is unit-tested without a DOM.
 */

/** The fields of a product the sidebar lists. Note `brand` holds the product's category name. */
type ListedProduct = {
	slug: string;
	brand: string;
	categorySlug: string | null;
	created: string;
	facets: Facets;
};

/** One category heading in the sidebar: how many products it has. */
export type SidebarCategory = { slug: string; name: string; count: number };

/** One collapsible group under a category heading: attribute values ("facet") or sub-categories ("type"). */
export type SidebarGroup = {
	id: string;
	/** Heading of the collapsible group; without one the options are listed directly under the category. */
	label?: string;
	kind: "facet" | "type" | "category";
	key?: FacetKey;
	options: FilterOptionCount[];
};

/** The category headings with their product counts, in the shop's category order, New Arrivals last. */
export function sidebarCategories(products: readonly ListedProduct[]): SidebarCategory[] {
	const map = new Map<string, SidebarCategory>();
	for (const p of products) {
		if (!p.categorySlug || p.categorySlug === NEW_ARRIVALS_SLUG) continue;
		const entry = map.get(p.categorySlug) ?? { slug: p.categorySlug, name: p.brand, count: 0 };
		entry.count += 1;
		map.set(p.categorySlug, entry);
	}
	const list = [...map.values()];
	const newest = newArrivalSlugs(products);
	if (newest.size > 0) list.push({ slug: NEW_ARRIVALS_SLUG, name: NEW_ARRIVALS_NAME, count: newest.size });
	return list.sort((a, b) => categoryRank(a.slug) - categoryRank(b.slug));
}

/**
 * Everything listed under each category heading as collapsible groups: its attribute groups (Battery Capacity,
 * Brand, …) and its sub-categories (Mods, Atomizers, Type), each with how many products have each value. Under New
 * Arrivals the items are the categories its products sit in.
 */
export function sidebarGroups(products: readonly ListedProduct[]): Record<string, SidebarGroup[]> {
	const result: Record<string, SidebarGroup[]> = {};
	for (const slug of new Set([
		...Object.keys(CATEGORY_FILTER_GROUPS),
		...Object.keys(CATEGORY_SUBCATEGORIES),
	])) {
		if (slug === NEW_ARRIVALS_SLUG) continue;
		const here = products.filter((p) => p.categorySlug === slug);
		const attributeGroups: SidebarGroup[] = filterGroupsFor(slug).map((group) => ({
			id: `${slug}-${group.id}`,
			label: group.label,
			kind: "facet",
			key: group.key,
			options: groupOptions(group, here),
		}));
		const typeGroups: SidebarGroup[] = subcategoryOptions(CATEGORY_SUBCATEGORIES[slug] ?? [], here).map(
			(group, i) => ({
				id: `${slug}-types-${i}`,
				label: group.label,
				kind: "type",
				options: group.options,
			}),
		);
		result[slug] = [...attributeGroups, ...typeGroups].filter((g) => g.options.length > 0);
	}

	const fresh = newArrivalSlugs(products);
	const byCategory = new Map<string, { label: string; count: number }>();
	for (const p of products) {
		if (!fresh.has(p.slug) || !p.categorySlug) continue;
		const entry = byCategory.get(p.categorySlug) ?? { label: p.brand, count: 0 };
		entry.count += 1;
		byCategory.set(p.categorySlug, entry);
	}
	result[NEW_ARRIVALS_SLUG] =
		byCategory.size > 0
			? [
					{
						id: "new-arrivals-categories",
						kind: "category",
						options: [...byCategory]
							.sort(([a], [b]) => categoryRank(a) - categoryRank(b))
							.map(([value, { label, count }]) => ({ label, value, count })),
					},
				]
			: [];
	return result;
}

/** Category slug -> its name, over the whole catalog, for naming a ticked category the search words no longer match. */
export function categoryNames(
	products: readonly Pick<ListedProduct, "brand" | "categorySlug">[],
): Map<string, string> {
	const names = new Map<string, string>([[NEW_ARRIVALS_SLUG, NEW_ARRIVALS_NAME]]);
	for (const p of products)
		if (p.categorySlug && !names.has(p.categorySlug)) names.set(p.categorySlug, p.brand);
	return names;
}

/** One removable chip in the "Active filters" row. */
type ActiveFilterChip = { id: string; label: string; filter: ActiveFilter };

const typeLabels = new Map<string, string>(
	Object.values(CATEGORY_SUBCATEGORIES).flatMap((groups) =>
		groups.flatMap((g) => g.options.map((o): [string, string] => [o.value, o.label])),
	),
);

/**
 * A chip for every filter in the applied selection: categories, attribute values ("Puff Count: 20K"), sub-categories
 * and price. `categoryName` names a category slug; `money` formats the price range.
 */
export function activeFilterChips(
	applied: ShopFilterSelection,
	{ categoryName, money }: { categoryName: (slug: string) => string; money: (n: number) => string },
): ActiveFilterChip[] {
	const chips: ActiveFilterChip[] = applied.cats.map((slug) => ({
		id: `category:${slug}`,
		label: categoryName(slug),
		filter: { kind: "category", slug },
	}));
	for (const [category, groups] of Object.entries(applied.facets)) {
		for (const [key, values] of Object.entries(groups) as [FacetKey, string[]][]) {
			const groupLabel = filterGroupsFor(category).find((g) => g.key === key)?.label ?? key;
			for (const value of values) {
				chips.push({
					id: `facet:${category}:${key}:${value}`,
					label: `${groupLabel}: ${value}`,
					filter: { kind: "facet", category, key, value },
				});
			}
		}
	}
	for (const value of applied.types) {
		chips.push({
			id: `type:${value}`,
			label: typeLabels.get(value) ?? value,
			filter: { kind: "type", value },
		});
	}
	if (applied.range) {
		chips.push({
			id: "price",
			label: `${money(applied.range[0])} – ${money(applied.range[1])}`,
			filter: { kind: "price" },
		});
	}
	return chips;
}
