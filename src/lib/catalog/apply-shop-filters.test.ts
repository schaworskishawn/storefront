import { describe, expect, it } from "vitest";
import {
	type FilterableProduct,
	type ShopFilterSelection,
	applyShopFilters,
	clampRange,
	emptyShopFilters,
	hasShopFilters,
	normalizeRange,
	priceBounds,
} from "./apply-shop-filters";
import { NEW_ARRIVALS_COUNT, NEW_ARRIVALS_SLUG } from "./new-arrivals";

const product = (slug: string, overrides: Partial<FilterableProduct> = {}): FilterableProduct => ({
	slug,
	categorySlug: "disposables",
	price: 10,
	created: "2026-01-01T00:00:00Z",
	facets: {},
	...overrides,
});

const select = (overrides: Partial<ShopFilterSelection>): ShopFilterSelection => ({
	...emptyShopFilters(),
	...overrides,
});

const slugs = (products: readonly { slug: string }[]) => products.map((p) => p.slug);

describe("applyShopFilters", () => {
	const waka = product("waka", { facets: { brand: ["Waka"], "puff-count": ["20K"], type: ["Disposables"] } });
	const kraze = product("kraze", {
		facets: { brand: ["Kraze"], "puff-count": ["80K"], type: ["Disposables"] },
	});
	const juice = product("juice", { categorySlug: "ejuice", facets: { brand: ["Geek Bar"] } });
	const podMod = product("pod-mod", { categorySlug: "hardware", facets: { type: ["Pod Mod"] } });
	const rta = product("rta", { categorySlug: "hardware", facets: { type: ["RTA"] } });
	const loose = product("loose", { categorySlug: null });
	const catalog = [waka, kraze, juice, podMod, rta, loose];

	it("keeps every product, in order, when nothing is ticked", () => {
		const result = applyShopFilters(catalog, emptyShopFilters());
		expect(slugs(result)).toEqual(slugs(catalog));
		expect(result).not.toBe(catalog);
	});

	it("does not change the products it is given", () => {
		const copy = [...catalog];
		applyShopFilters(catalog, select({ cats: ["hardware"], range: [0, 1] }));
		expect(catalog).toEqual(copy);
	});

	it("combines ticked categories with 'or' and drops products without a category", () => {
		expect(slugs(applyShopFilters(catalog, select({ cats: ["ejuice"] })))).toEqual(["juice"]);
		expect(slugs(applyShopFilters(catalog, select({ cats: ["ejuice", "hardware"] })))).toEqual([
			"juice",
			"pod-mod",
			"rta",
		]);
	});

	it("narrows only the category an attribute value sits under", () => {
		const facets = { disposables: { brand: ["Waka"] } };
		// Disposables narrow to Waka; E-Juice, ticked alongside, is untouched.
		expect(slugs(applyShopFilters(catalog, select({ cats: ["disposables", "ejuice"], facets })))).toEqual([
			"waka",
			"juice",
		]);
	});

	it("needs every ticked attribute group to match, and any value within a group", () => {
		const both = { disposables: { brand: ["Waka", "Kraze"], "puff-count": ["80K"] } };
		expect(slugs(applyShopFilters(catalog, select({ cats: ["disposables"], facets: both })))).toEqual([
			"kraze",
		]);
	});

	it("narrows a category to its ticked sub-categories and leaves the others alone", () => {
		expect(slugs(applyShopFilters(catalog, select({ cats: ["hardware"], types: ["RTA"] })))).toEqual(["rta"]);
		expect(
			slugs(applyShopFilters(catalog, select({ cats: ["hardware", "ejuice"], types: ["RTA"] }))),
		).toEqual(["juice", "rta"]);
	});

	it("includes products priced exactly at either end of the range", () => {
		const priced = [1, 5, 10, 15].map((price) => product(`p${price}`, { price }));
		expect(slugs(applyShopFilters(priced, select({ range: [5, 10] })))).toEqual(["p5", "p10"]);
	});

	it("applies every kind of filter together", () => {
		const cheapWaka = product("cheap-waka", { price: 8, facets: { brand: ["Waka"] } });
		const dearWaka = product("dear-waka", { price: 30, facets: { brand: ["Waka"] } });
		const cheapKraze = product("cheap-kraze", { price: 8, facets: { brand: ["Kraze"] } });
		const result = applyShopFilters(
			[cheapWaka, dearWaka, cheapKraze],
			select({ cats: ["disposables"], facets: { disposables: { brand: ["Waka"] } }, range: [0, 10] }),
		);
		expect(slugs(result)).toEqual(["cheap-waka"]);
	});

	describe("New Arrivals", () => {
		// 14 hardware products, then 3 newer coils: the 12 newest overall are the 3 coils and 9 hardware.
		const hardware = Array.from({ length: 14 }, (_, i) =>
			product(`hw-${i + 1}`, {
				categorySlug: "hardware",
				created: `2026-02-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
			}),
		);
		const coils = Array.from({ length: 3 }, (_, i) =>
			product(`coil-${i + 1}`, { categorySlug: "coils", created: `2026-03-0${i + 1}T00:00:00Z` }),
		);
		const store = [...hardware, ...coils];

		it("on its own is the newest products in the whole list, wherever their category", () => {
			const result = applyShopFilters(store, select({ cats: [NEW_ARRIVALS_SLUG] }));
			expect(result).toHaveLength(NEW_ARRIVALS_COUNT);
			expect(slugs(result)).toEqual(expect.arrayContaining(["coil-1", "coil-2", "coil-3", "hw-14", "hw-6"]));
			expect(slugs(result)).not.toContain("hw-5");
		});

		it("with a category is the newest of that category", () => {
			const result = applyShopFilters(store, select({ cats: ["hardware", NEW_ARRIVALS_SLUG] }));
			expect(result).toHaveLength(NEW_ARRIVALS_COUNT);
			// hw-5 is outside the overall newest 12 but inside the newest 12 hardware products.
			expect(slugs(result)).toContain("hw-5");
			expect(slugs(result)).not.toContain("hw-2");
			expect(slugs(result).some((slug) => slug.startsWith("coil"))).toBe(false);
		});

		it("is every product when the list is shorter than a full set", () => {
			const few = [product("a"), product("b")];
			expect(slugs(applyShopFilters(few, select({ cats: [NEW_ARRIVALS_SLUG] })))).toEqual(["a", "b"]);
		});
	});
});

describe("hasShopFilters", () => {
	it("is false for an empty selection, even with empty attribute lists left behind", () => {
		expect(hasShopFilters(emptyShopFilters())).toBe(false);
		expect(hasShopFilters(select({ facets: { disposables: { brand: [] } } }))).toBe(false);
	});

	it("is true for anything ticked", () => {
		expect(hasShopFilters(select({ cats: ["hardware"] }))).toBe(true);
		expect(hasShopFilters(select({ types: ["RTA"] }))).toBe(true);
		expect(hasShopFilters(select({ range: [1, 2] }))).toBe(true);
		expect(hasShopFilters(select({ facets: { disposables: { brand: ["Waka"] } } }))).toBe(true);
	});
});

describe("price range", () => {
	const bounds = { min: 5, max: 50 };

	it("takes whole-dollar bounds from the cheapest and dearest product", () => {
		expect(priceBounds([{ price: 5.5 }, { price: 49.01 }, { price: 12 }])).toEqual({ min: 5, max: 50 });
		expect(priceBounds([])).toEqual({ min: 0, max: 0 });
	});

	it("spans the whole bounds while untouched", () => {
		expect(clampRange(null, bounds)).toEqual([5, 50]);
		expect(normalizeRange(null, bounds)).toBeNull();
	});

	it("clamps thumbs dragged outside bounds that have since changed", () => {
		expect(clampRange([0, 100], bounds)).toEqual([5, 50]);
		expect(clampRange([60, 70], bounds)).toEqual([50, 50]);
		expect(clampRange([30, 10], bounds)).toEqual([30, 30]);
	});

	it("turns a range that spans the bounds back into no filter at all", () => {
		expect(normalizeRange([5, 50], bounds)).toBeNull();
		expect(normalizeRange([0, 99], bounds)).toBeNull();
		expect(normalizeRange([10, 50], bounds)).toEqual([10, 50]);
	});
});
