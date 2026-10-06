import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FilterableProduct } from "./apply-shop-filters";
import { useShopFilters } from "./use-shop-filters";

/**
 * The repo has no DOM test environment, so this renders a probe component on the server and reads back, as JSON in the
 * markup, what the hook returns on the first render. Every state transition is covered by shop-filter-state.test.ts;
 * this checks the wiring between the reducer, the derived options and `applyShopFilters`.
 */
type Item = FilterableProduct & { brand: string };

const item = (slug: string, categorySlug: string, price: number, brand: string): Item => ({
	slug,
	categorySlug,
	price,
	brand,
	created: "2026-01-01T00:00:00Z",
	facets: {},
});

const catalog = [
	item("a", "disposables", 8, "Disposables"),
	item("b", "disposables", 20, "Disposables"),
	item("c", "hardware", 49.5, "Hardware"),
];

function probe(products: readonly Item[], options?: Parameters<typeof useShopFilters>[1]) {
	function Probe() {
		const { filtered, applied, bounds, categories, draft, hasAnyFilter } = useShopFilters(products, options);
		const data = { filtered: filtered.map((p) => p.slug), applied, bounds, categories, draft, hasAnyFilter };
		return createElement("script", { dangerouslySetInnerHTML: { __html: JSON.stringify(data) } });
	}
	const json = /<script>(.*)<\/script>/s.exec(renderToStaticMarkup(createElement(Probe)))?.[1];
	if (!json) throw new Error("the probe did not render");
	return JSON.parse(json) as {
		filtered: string[];
		applied: { cats: string[] };
		bounds: { min: number; max: number };
		categories: { slug: string; count: number }[];
		draft: { cats: string[]; lo: number; hi: number };
		hasAnyFilter: boolean;
	};
}

describe("useShopFilters", () => {
	it("starts with every product, nothing applied and the slider spanning all prices", () => {
		const filters = probe(catalog);
		expect(filters.filtered).toEqual(["a", "b", "c"]);
		expect(filters.applied.cats).toEqual([]);
		expect(filters.hasAnyFilter).toBe(false);
		expect(filters.bounds).toEqual({ min: 8, max: 50 });
		expect(filters.draft).toMatchObject({ lo: 8, hi: 50, cats: [] });
	});

	it("derives the sidebar's categories and price extremes from the products it is given", () => {
		const filters = probe(catalog.filter((p) => p.categorySlug === "hardware"));
		expect(filters.categories.map((c) => `${c.slug}:${c.count}`)).toEqual(["hardware:1", "new-arrivals:1"]);
		expect(filters.bounds).toEqual({ min: 49, max: 50 });
	});

	it("pre-applies the initial categories", () => {
		const filters = probe(catalog, { initialCategories: ["hardware"] });
		expect(filters.filtered).toEqual(["c"]);
		expect(filters.applied.cats).toEqual(["hardware"]);
		expect(filters.draft.cats).toEqual(["hardware"]);
		expect(filters.hasAnyFilter).toBe(true);
	});

	it("handles an empty product list", () => {
		const filters = probe([]);
		expect(filters.filtered).toEqual([]);
		expect(filters.categories).toEqual([]);
		expect(filters.bounds).toEqual({ min: 0, max: 0 });
	});
});
