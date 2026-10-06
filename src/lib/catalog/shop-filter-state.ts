import {
	type PriceBounds,
	type ShopFilterSelection,
	emptyShopFilters,
	normalizeRange,
} from "./apply-shop-filters";
import { NEW_ARRIVALS_SLUG } from "./new-arrivals";
import type { FacetKey } from "./product-facets";
import { type CategoryFacetSelection, categoryOfType } from "./shop-filters";

/**
 * The shop sidebar's two selections, as a pure reducer so every transition is unit-tested without a DOM.
 * `draft` is what the sidebar controls show; `applied` is what the product list is filtered by. Ticking only changes the
 * draft; APPLY copies it across. The one-click paths (a category tile, "Clear all", removing an active-filter chip)
 * change both at once.
 */
export type ShopFilterState = { draft: ShopFilterSelection; applied: ShopFilterSelection };

/** One applied filter that can be removed on its own (an "Active filters" chip). */
export type ActiveFilter =
	| { kind: "category"; slug: string }
	| { kind: "facet"; category: string; key: FacetKey; value: string }
	| { kind: "type"; value: string }
	| { kind: "price" };

export type ShopFilterAction =
	| { type: "select-category"; slug: string | null }
	| { type: "toggle-category"; slug: string }
	| { type: "toggle-under-new-arrivals"; slug: string }
	| { type: "toggle-type"; value: string }
	| { type: "toggle-facet"; category: string; key: FacetKey; value: string }
	| { type: "set-range"; range: [number, number] }
	| { type: "apply"; bounds: PriceBounds }
	| { type: "clear-all" }
	| { type: "remove"; filter: ActiveFilter };

/** `initialCategories` pre-applies a category filter, e.g. /shop?category=bundles. */
export function initShopFilterState(initialCategories: readonly string[] = []): ShopFilterState {
	return {
		draft: { ...emptyShopFilters(), cats: [...initialCategories] },
		applied: { ...emptyShopFilters(), cats: [...initialCategories] },
	};
}

/** Attribute values only count while their category is still ticked. */
export function pruneFacets(facets: CategoryFacetSelection, cats: readonly string[]): CategoryFacetSelection {
	return Object.fromEntries(Object.entries(facets).filter(([category]) => cats.includes(category)));
}

/** A sub-category only counts while its category is still ticked. */
export function pruneTypes(types: readonly string[], cats: readonly string[]): string[] {
	return types.filter((value) => cats.includes(categoryOfType(value) ?? ""));
}

const toggled = <T>(list: readonly T[], item: T): T[] =>
	list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

const withItem = <T>(list: readonly T[], item: T): T[] => (list.includes(item) ? [...list] : [...list, item]);

/** Takes a category out of a selection together with everything that was ticked under it. */
function withoutCategory(selection: ShopFilterSelection, slug: string): ShopFilterSelection {
	return {
		...selection,
		cats: selection.cats.filter((s) => s !== slug),
		types: selection.types.filter((value) => categoryOfType(value) !== slug),
		facets: Object.fromEntries(Object.entries(selection.facets).filter(([category]) => category !== slug)),
	};
}

function withoutFacetValue(
	selection: ShopFilterSelection,
	category: string,
	key: FacetKey,
	value: string,
): ShopFilterSelection {
	const mine = selection.facets[category];
	const values = mine?.[key];
	if (!mine || !values) return selection;
	return {
		...selection,
		facets: { ...selection.facets, [category]: { ...mine, [key]: values.filter((v) => v !== value) } },
	};
}

/** Removes one active filter from a selection. */
function withoutFilter(selection: ShopFilterSelection, filter: ActiveFilter): ShopFilterSelection {
	switch (filter.kind) {
		case "category":
			return withoutCategory(selection, filter.slug);
		case "facet":
			return withoutFacetValue(selection, filter.category, filter.key, filter.value);
		case "type":
			return { ...selection, types: selection.types.filter((value) => value !== filter.value) };
		case "price":
			return { ...selection, range: null };
	}
}

function toggleCategory(draft: ShopFilterSelection, slug: string): ShopFilterSelection {
	// Unticking a category also unticks what was ticked under it.
	if (draft.cats.includes(slug)) return withoutCategory(draft, slug);
	return { ...draft, cats: [...draft.cats, slug] };
}

export function shopFilterReducer(state: ShopFilterState, action: ShopFilterAction): ShopFilterState {
	const { draft, applied } = state;
	switch (action.type) {
		case "select-category": {
			// A one-click jump (e.g. a "Browse Collections" tile): sets draft *and* applied, with no separate APPLY.
			// Other categories offer other filters, so a jump to a new category starts from a clean slate.
			const cats = action.slug ? [action.slug] : [];
			return {
				draft: { ...draft, cats, facets: {}, types: [] },
				applied: { ...applied, cats, facets: {}, types: [] },
			};
		}
		case "toggle-category":
			return { ...state, draft: toggleCategory(draft, action.slug) };
		case "toggle-under-new-arrivals": {
			// Under New Arrivals the items are categories: ticking one narrows New Arrivals to it (and ticks New Arrivals).
			const next = toggleCategory(draft, action.slug);
			return { ...state, draft: { ...next, cats: withItem(next.cats, NEW_ARRIVALS_SLUG) } };
		}
		case "toggle-type": {
			// Ticking a sub-category ticks the category it sits under.
			const owner = categoryOfType(action.value);
			return {
				...state,
				draft: {
					...draft,
					cats: owner ? withItem(draft.cats, owner) : draft.cats,
					types: toggled(draft.types, action.value),
				},
			};
		}
		case "toggle-facet": {
			// Ticking a value under a category ticks that category too.
			const mine = draft.facets[action.category] ?? {};
			const next = toggled(mine[action.key] ?? [], action.value);
			return {
				...state,
				draft: {
					...draft,
					cats: withItem(draft.cats, action.category),
					facets: { ...draft.facets, [action.category]: { ...mine, [action.key]: next } },
				},
			};
		}
		case "set-range":
			return { ...state, draft: { ...draft, range: action.range } };
		case "apply":
			return {
				...state,
				applied: {
					cats: [...draft.cats],
					range: normalizeRange(draft.range, action.bounds),
					facets: pruneFacets(draft.facets, draft.cats),
					types: pruneTypes(draft.types, draft.cats),
				},
			};
		case "clear-all":
			return { draft: emptyShopFilters(), applied: emptyShopFilters() };
		case "remove":
			return {
				draft: withoutFilter(draft, action.filter),
				applied: withoutFilter(applied, action.filter),
			};
	}
}
