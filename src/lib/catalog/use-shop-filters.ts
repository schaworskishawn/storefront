import { useMemo, useReducer } from "react";
import {
	type FilterableProduct,
	type PriceBounds,
	type ShopFilterSelection,
	applyShopFilters,
	clampRange,
	hasShopFilters,
	normalizeRange,
	priceBounds,
} from "./apply-shop-filters";
import type { FacetKey } from "./product-facets";
import {
	type SidebarCategory,
	type SidebarGroup,
	sidebarCategories,
	sidebarGroups,
} from "./shop-filter-options";
import {
	type ActiveFilter,
	type ShopFilterAction,
	initShopFilterState,
	pruneFacets,
	pruneTypes,
	shopFilterReducer,
} from "./shop-filter-state";
import type { CategoryFacetSelection } from "./shop-filters";

/** What `ShopFilterSidebar` needs: the sidebar's options and controls, with no knowledge of the products' type. */
export type ShopFilterControls = {
	/** The price slider's extremes: the cheapest and dearest of the products being filtered. */
	bounds: PriceBounds;
	categories: SidebarCategory[];
	categoryGroups: Record<string, SidebarGroup[]>;
	/** What the sidebar controls show; nothing here filters the list until `apply`. */
	draft: {
		cats: string[];
		facets: CategoryFacetSelection;
		types: string[];
		/** The slider thumbs, clamped into `bounds`. */
		lo: number;
		hi: number;
	};
	/** What the list is filtered by. */
	applied: ShopFilterSelection;
	/** Is anything ticked, dragged or applied? Drives "Clear all". */
	hasAnyFilter: boolean;
	toggleCategory: (slug: string) => void;
	toggleUnderNewArrivals: (slug: string) => void;
	toggleType: (value: string) => void;
	toggleFacet: (category: string, key: FacetKey, value: string) => void;
	setRange: (range: [number, number]) => void;
	/** Applies the draft (the APPLY FILTERS button). */
	apply: () => void;
	/** One-click jump to a single category (a tile), or to all of them with null; applies immediately. */
	selectCategory: (slug: string | null) => void;
	/** Drops one applied filter (an "Active filters" chip) from the applied and the draft selection. */
	remove: (filter: ActiveFilter) => void;
	clearAll: () => void;
};

type ShopFilters<T> = ShopFilterControls & {
	/** `products` narrowed by the applied filters, in their original order. */
	filtered: T[];
};

type Options = {
	/** Categories applied from the start, e.g. from /shop?category=bundles. Only read on the first render. */
	initialCategories?: readonly string[];
	/** Called whenever the applied filters change, e.g. to go back to the first page. */
	onApplied?: () => void;
};

/**
 * Filter state for the shop sidebar, shared by the shop and the search page: ticking only changes a draft, APPLY copies
 * it to what the list is filtered by. Everything the sidebar lists (category counts, attribute values, sub-categories,
 * price extremes) is derived from `products`, so pass it whatever is being filtered. Keep `products` referentially
 * stable (e.g. memoised), as the derived options are recomputed whenever it changes.
 */
export function useShopFilters<T extends FilterableProduct & { brand: string }>(
	products: readonly T[],
	{ initialCategories, onApplied }: Options = {},
): ShopFilters<T> {
	const [state, dispatch] = useReducer(shopFilterReducer, initialCategories, initShopFilterState);
	const { draft, applied } = state;

	const bounds = useMemo(() => priceBounds(products), [products]);
	const categories = useMemo(() => sidebarCategories(products), [products]);
	const categoryGroups = useMemo(() => sidebarGroups(products), [products]);
	const filtered = useMemo(() => applyShopFilters(products, applied), [products, applied]);

	const facets = useMemo(() => pruneFacets(draft.facets, draft.cats), [draft.facets, draft.cats]);
	const types = useMemo(() => pruneTypes(draft.types, draft.cats), [draft.types, draft.cats]);
	const [lo, hi] = clampRange(draft.range, bounds);

	const hasAnyFilter =
		hasShopFilters(applied) ||
		hasShopFilters({ cats: draft.cats, facets, types, range: normalizeRange(draft.range, bounds) });

	// Actions that change what the list shows also tell the page, which goes back to its first page.
	const changeApplied = (action: ShopFilterAction) => {
		dispatch(action);
		onApplied?.();
	};

	return {
		bounds,
		categories,
		categoryGroups,
		draft: { cats: draft.cats, facets, types, lo, hi },
		applied,
		hasAnyFilter,
		filtered,
		toggleCategory: (slug) => dispatch({ type: "toggle-category", slug }),
		toggleUnderNewArrivals: (slug) => dispatch({ type: "toggle-under-new-arrivals", slug }),
		toggleType: (value) => dispatch({ type: "toggle-type", value }),
		toggleFacet: (category, key, value) => dispatch({ type: "toggle-facet", category, key, value }),
		setRange: (range) => dispatch({ type: "set-range", range }),
		apply: () => changeApplied({ type: "apply", bounds }),
		selectCategory: (slug) => changeApplied({ type: "select-category", slug }),
		remove: (filter) => changeApplied({ type: "remove", filter }),
		clearAll: () => changeApplied({ type: "clear-all" }),
	};
}
