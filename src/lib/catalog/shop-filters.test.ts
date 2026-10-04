import { describe, expect, it } from "vitest";
import { extractFacets } from "./product-facets";
import {
	CATEGORY_FILTER_GROUPS,
	CATEGORY_SUBCATEGORIES,
	categoryOfType,
	filterGroupsFor,
	groupOptions,
	matchesCategoryFacets,
	matchesFacets,
	matchesSubcategories,
	subcategoryOptions,
	type FilterGroup,
} from "./shop-filters";

describe("extractFacets", () => {
	it("reads product attributes, variant options and the product type", () => {
		const facets = extractFacets({
			productType: { name: "Disposables" },
			attributes: [
				{ attribute: { slug: "brand" }, values: [{ name: "Waka" }] },
				{ attribute: { slug: "puff-count" }, values: [{ name: "20K" }] },
				{ attribute: { slug: "flavor-profile" }, values: [{ name: "Ice" }, { name: "Mint" }] },
				{ attribute: { slug: "advanced-features" }, values: [{ name: "ignored" }] },
			],
			variants: [
				{
					attributes: [{ attribute: { slug: "nicotine-strength-variant" }, values: [{ name: "20 mg/mL" }] }],
				},
				{
					attributes: [{ attribute: { slug: "nicotine-strength-variant" }, values: [{ name: "10 mg/mL" }] }],
				},
			],
		});
		expect(facets).toEqual({
			brand: ["Waka"],
			"puff-count": ["20K"],
			"flavor-profile": ["Ice", "Mint"],
			"nicotine-strength": ["20 mg/mL", "10 mg/mL"],
			type: ["Disposables"],
		});
	});

	it("handles products with nothing to filter on", () => {
		expect(extractFacets({})).toEqual({});
		expect(extractFacets({ attributes: [], variants: [], productType: null })).toEqual({});
	});

	it("does not repeat a value shared by several variants", () => {
		const variant = {
			attributes: [{ attribute: { slug: "bottle-size-variant" }, values: [{ name: "30 ML" }] }],
		};
		expect(extractFacets({ variants: [variant, variant] })["bottle-size"]).toEqual(["30 ML"]);
	});
});

describe("filterGroupsFor", () => {
	it("gives Disposables and E-Liquid their own groups, in your order", () => {
		expect(filterGroupsFor("disposables").map((g) => g.label)).toEqual([
			"Battery Capacity",
			"Brand",
			"E-Liquid Capacity",
			"Flavor Profile",
			"Nicotine Strength",
			"Puff Count",
		]);
		expect(filterGroupsFor("ejuice").map((g) => g.label)).toEqual([
			"Brand",
			"Bottle Size",
			"Nicotine Strength",
			"Flavor Profile",
		]);
	});

	it("gives Hardware, Coils and Accessories no groups (they have sub-categories instead)", () => {
		expect(filterGroupsFor("hardware")).toEqual([]);
		expect(filterGroupsFor("coils")).toEqual([]);
		expect(filterGroupsFor("accessories")).toEqual([]);
	});

	it("gives unknown categories no groups", () => {
		expect(filterGroupsFor("unknown-category")).toEqual([]);
	});

	it("treats the legacy e-liquid slugs as E-Liquid", () => {
		expect(filterGroupsFor("e-liquids")).toBe(CATEGORY_FILTER_GROUPS.ejuice);
		expect(filterGroupsFor("e-liquid")).toBe(CATEGORY_FILTER_GROUPS.ejuice);
	});
});

describe("matchesCategoryFacets", () => {
	const disposable = { categorySlug: "disposables", facets: { brand: ["Waka"], "puff-count": ["20K"] } };
	const juice = { categorySlug: "ejuice", facets: { brand: ["Geek Bar"] } };

	it("applies only the values ticked under the product's own category", () => {
		const selection = { disposables: { brand: ["Kraze"] } };
		expect(matchesCategoryFacets(disposable, selection)).toBe(false);
		expect(matchesCategoryFacets(juice, selection)).toBe(true);
	});

	it("matches everything when nothing is ticked, including products without a category", () => {
		expect(matchesCategoryFacets(disposable, {})).toBe(true);
		expect(
			matchesCategoryFacets({ categorySlug: null, facets: {} }, { disposables: { brand: ["Waka"] } }),
		).toBe(true);
	});

	it("needs every ticked group under a category to match", () => {
		const selection = { disposables: { brand: ["Waka"], "puff-count": ["80K"] } };
		expect(matchesCategoryFacets(disposable, selection)).toBe(false);
		expect(
			matchesCategoryFacets(disposable, { disposables: { brand: ["Waka"], "puff-count": ["20K"] } }),
		).toBe(true);
	});
});

describe("matchesFacets", () => {
	const product = { brand: ["Waka"], "flavor-profile": ["Ice", "Mint"], "puff-count": ["20K"] };

	it("matches when nothing is ticked", () => {
		expect(matchesFacets(product, {})).toBe(true);
		expect(matchesFacets(product, { brand: [] })).toBe(true);
	});

	it("matches any ticked value within one facet", () => {
		expect(matchesFacets(product, { "flavor-profile": ["Fruit", "Mint"] })).toBe(true);
		expect(matchesFacets(product, { "flavor-profile": ["Fruit"] })).toBe(false);
	});

	it("needs every ticked facet to match", () => {
		expect(matchesFacets(product, { brand: ["Waka"], "puff-count": ["20K"] })).toBe(true);
		expect(matchesFacets(product, { brand: ["Waka"], "puff-count": ["80K"] })).toBe(false);
	});

	it("does not match a product that lacks the facet entirely", () => {
		expect(matchesFacets({}, { brand: ["Waka"] })).toBe(false);
	});
});

describe("groupOptions", () => {
	const scope = (values: string[][]) => values.map((v) => ({ facets: { "puff-count": v } }));
	const puffs: FilterGroup = { id: "puff-count", label: "Puff Count", key: "puff-count", sort: "asc" };

	it("counts products per value and sorts numerically", () => {
		const options = groupOptions(puffs, scope([["100K"], ["20K"], ["100K"], ["63K"], ["150K"]]));
		expect(options.map((o) => `${o.value}:${o.count}`)).toEqual(["20K:1", "63K:1", "100K:2", "150K:1"]);
	});

	it("sorts strengths from highest to lowest", () => {
		const group: FilterGroup = { id: "n", label: "Nicotine", key: "nicotine-strength", sort: "desc" };
		const options = groupOptions(group, [
			{ facets: { "nicotine-strength": ["0 mg/mL", "20 mg/mL", "6 mg/mL"] } },
		]);
		expect(options.map((o) => o.value)).toEqual(["20 mg/mL", "6 mg/mL", "0 mg/mL"]);
	});

	it("puts listed values first in the given order, then the rest alphabetically", () => {
		const group: FilterGroup = {
			id: "f",
			label: "Flavor",
			key: "flavor-profile",
			order: ["Taffy", "Fruit", "Mint"],
		};
		const options = groupOptions(group, [
			{ facets: { "flavor-profile": ["Mint", "Beverage", "Fruit", "Taffy", "Acai"] } },
		]);
		expect(options.map((o) => o.value)).toEqual(["Taffy", "Fruit", "Mint", "Acai", "Beverage"]);
	});

	it("is empty when nothing in scope has the facet", () => {
		expect(groupOptions(puffs, [{ facets: {} }])).toEqual([]);
	});
});

describe("subcategories", () => {
	it("knows which category each product type belongs to", () => {
		expect(categoryOfType("Pod Mod")).toBe("hardware");
		expect(categoryOfType("Cartridges")).toBe("coils");
		expect(categoryOfType("Charger")).toBe("accessories");
		expect(categoryOfType("Disposables")).toBeUndefined();
	});

	it("lists Hardware as Mods and Atomizers with your labels, hiding empty types", () => {
		const products = [
			{ facets: { type: ["Pod Mod"] } },
			{ facets: { type: ["RTA"] } },
			{ facets: { type: ["Sub-Ohm Tanks"] } },
		];
		const groups = subcategoryOptions(CATEGORY_SUBCATEGORIES.hardware, products);
		expect(groups.map((g) => g.label)).toEqual(["Mods", "Atomizers"]);
		expect(groups[0].options.map((o) => `${o.label}:${o.count}`)).toEqual(["Pod Mods:1"]);
		expect(groups[1].options.map((o) => `${o.label}:${o.count}`)).toEqual(["Sub-ohm Tanks:1", "RTA:1"]);
	});

	it("drops a heading when none of its types has products, and hides Pods until it has some", () => {
		const groups = subcategoryOptions(CATEGORY_SUBCATEGORIES.hardware, [{ facets: { type: ["RTA"] } }]);
		expect(groups.map((g) => g.label)).toEqual(["Atomizers"]);
		const coils = subcategoryOptions(CATEGORY_SUBCATEGORIES.coils, [
			{ facets: { type: ["Coils"] } },
			{ facets: { type: ["Cartridges"] } },
			{ facets: { type: ["Coils"] } },
		]);
		expect(coils[0].label).toBeUndefined();
		expect(coils[0].options).toEqual([
			{ label: "Cartridges", value: "Cartridges", count: 1 },
			{ label: "Coils", value: "Coils", count: 2 },
		]);
	});

	describe("matchesSubcategories", () => {
		const podMod = { categorySlug: "hardware", facets: { type: ["Pod Mod"] } };
		const rta = { categorySlug: "hardware", facets: { type: ["RTA"] } };
		const coil = { categorySlug: "coils", facets: { type: ["Coils"] } };
		const cartridge = { categorySlug: "coils", facets: { type: ["Cartridges"] } };
		const disposable = { categorySlug: "disposables", facets: { type: ["Disposables"] } };

		it("matches everything when nothing is ticked", () => {
			expect(matchesSubcategories(podMod, [])).toBe(true);
		});

		it("narrows a category to the ticked sub-categories", () => {
			expect(matchesSubcategories(podMod, ["Pod Mod", "RTA"])).toBe(true);
			expect(matchesSubcategories(rta, ["Pod Mod"])).toBe(false);
		});

		it("leaves categories with nothing ticked untouched", () => {
			// Hardware > RTA and Coils > Cartridges ticked: all other Hardware drops, Coils narrows, and the rest is unaffected.
			const ticked = ["RTA", "Cartridges"];
			expect(matchesSubcategories(rta, ticked)).toBe(true);
			expect(matchesSubcategories(podMod, ticked)).toBe(false);
			expect(matchesSubcategories(cartridge, ticked)).toBe(true);
			expect(matchesSubcategories(coil, ticked)).toBe(false);
			expect(matchesSubcategories(disposable, ticked)).toBe(true);
		});

		it("does not narrow a category whose sub-categories are not ticked", () => {
			expect(matchesSubcategories(coil, ["RTA"])).toBe(true);
		});
	});
});
