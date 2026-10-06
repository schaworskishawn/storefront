import { describe, expect, it } from "vitest";
import { emptyShopFilters } from "./apply-shop-filters";
import { NEW_ARRIVALS_NAME, NEW_ARRIVALS_SLUG } from "./new-arrivals";
import type { Facets } from "./product-facets";
import { activeFilterChips, categoryNames, sidebarCategories, sidebarGroups } from "./shop-filter-options";

type Item = { slug: string; brand: string; categorySlug: string | null; created: string; facets: Facets };

let n = 0;
/** `brand` holds the category name, as on a HomeProduct. */
const item = (categorySlug: string | null, brand: string, facets: Facets = {}, created?: string): Item => {
	n += 1;
	return {
		slug: `p${n}`,
		brand,
		categorySlug,
		created: created ?? `2026-01-${String(n).padStart(2, "0")}T00:00:00Z`,
		facets,
	};
};

const disposable = (facets: Facets) =>
	item("disposables", "Disposables", { ...facets, type: ["Disposables"] });
const hardware = (type: string) => item("hardware", "Hardware", { type: [type] });

describe("sidebarCategories", () => {
	it("counts products per category in the shop's order, with New Arrivals last", () => {
		const products = [hardware("RTA"), disposable({}), hardware("Pod Mod"), item("ejuice", "E-Juice")];
		const list = sidebarCategories(products);
		expect(list.map((c) => `${c.slug}:${c.count}`)).toEqual([
			"disposables:1",
			"ejuice:1",
			"hardware:2",
			`${NEW_ARRIVALS_SLUG}:4`,
		]);
		expect(list[0].name).toBe("Disposables");
		expect(list.at(-1)?.name).toBe(NEW_ARRIVALS_NAME);
	});

	it("follows the products it is given: a search narrows the counts", () => {
		const all = [
			hardware("RTA"),
			hardware("Pod Mod"),
			disposable({}),
			disposable({}),
			item("coils", "Coils"),
		];
		const matching = all.filter((p) => p.categorySlug === "disposables");
		expect(sidebarCategories(matching).map((c) => `${c.slug}:${c.count}`)).toEqual([
			"disposables:2",
			`${NEW_ARRIVALS_SLUG}:2`,
		]);
	});

	it("skips products without a category, and lists nothing for no products", () => {
		expect(sidebarCategories([item(null, "")]).map((c) => c.slug)).toEqual([NEW_ARRIVALS_SLUG]);
		expect(sidebarCategories([])).toEqual([]);
	});
});

describe("sidebarGroups", () => {
	it("lists each category's attribute values with counts, in the category's group order", () => {
		const groups = sidebarGroups([
			disposable({ brand: ["Waka"], "puff-count": ["20K"] }),
			disposable({ brand: ["Waka"], "puff-count": ["80K"] }),
			disposable({ brand: ["Kraze"], "puff-count": ["20K"] }),
		]).disposables;
		expect(groups.map((g) => g.label)).toEqual(["Brand", "Puff Count"]);
		expect(groups[0].options.map((o) => `${o.value}:${o.count}`)).toEqual(["Waka:2", "Kraze:1"]);
		expect(groups[1].options.map((o) => `${o.value}:${o.count}`)).toEqual(["20K:2", "80K:1"]);
		expect(groups[0]).toMatchObject({ kind: "facet", key: "brand" });
	});

	it("lists sub-categories as type groups under their own headings", () => {
		const groups = sidebarGroups([hardware("Pod Mod"), hardware("RTA"), hardware("RTA")]).hardware;
		expect(groups.map((g) => `${g.kind}:${g.label}`)).toEqual(["type:Mods", "type:Atomizers"]);
		expect(groups[1].options.map((o) => `${o.label}:${o.count}`)).toEqual(["RTA:2"]);
	});

	it("follows the products it is given: values nobody in them has disappear", () => {
		const all = [
			disposable({ brand: ["Waka"] }),
			disposable({ brand: ["Kraze"] }),
			hardware("RTA"),
			hardware("Pod Mod"),
		];
		const searched = all.filter((p) => p.facets.brand?.[0] === "Waka" || p.facets.type?.[0] === "RTA");
		const groups = sidebarGroups(searched);
		expect(groups.disposables.find((g) => g.label === "Brand")?.options.map((o) => o.value)).toEqual([
			"Waka",
		]);
		expect(groups.hardware.flatMap((g) => g.options.map((o) => o.value))).toEqual(["RTA"]);
	});

	it("leaves a category with nothing to list empty", () => {
		expect(sidebarGroups([]).hardware).toEqual([]);
		expect(sidebarGroups([hardware("Not A Listed Type")]).hardware).toEqual([]);
	});

	it("lists the categories of the newest products under New Arrivals", () => {
		const groups = sidebarGroups([
			item("hardware", "Hardware"),
			item("disposables", "Disposables"),
			item("hardware", "Hardware"),
		])[NEW_ARRIVALS_SLUG];
		expect(groups).toHaveLength(1);
		expect(groups[0]).toMatchObject({ kind: "category" });
		expect(groups[0].options.map((o) => `${o.value}:${o.label}:${o.count}`)).toEqual([
			"disposables:Disposables:1",
			"hardware:Hardware:2",
		]);
	});

	it("lists nothing under New Arrivals when there are no products", () => {
		expect(sidebarGroups([])[NEW_ARRIVALS_SLUG]).toEqual([]);
	});
});

describe("categoryNames", () => {
	it("names every category of the catalog, New Arrivals included", () => {
		const names = categoryNames([item("hardware", "Hardware"), item("coils", "Coils"), item(null, "")]);
		expect(names.get("hardware")).toBe("Hardware");
		expect(names.get("coils")).toBe("Coils");
		expect(names.get(NEW_ARRIVALS_SLUG)).toBe(NEW_ARRIVALS_NAME);
		expect(names.size).toBe(3);
	});
});

describe("activeFilterChips", () => {
	const options = {
		categoryName: (slug: string) => ({ disposables: "Disposables", hardware: "Hardware" })[slug] ?? slug,
		money: (n: number) => `$${n}`,
	};

	it("is empty when nothing is applied", () => {
		expect(activeFilterChips(emptyShopFilters(), options)).toEqual([]);
	});

	it("has a chip for each category, attribute value, sub-category and the price range", () => {
		const chips = activeFilterChips(
			{
				cats: ["disposables", "hardware"],
				range: [10, 20],
				facets: { disposables: { brand: ["Waka", "Kraze"], "puff-count": [] } },
				types: ["Pod Mod"],
			},
			options,
		);
		expect(chips.map((c) => c.label)).toEqual([
			"Disposables",
			"Hardware",
			"Brand: Waka",
			"Brand: Kraze",
			"Pod Mods",
			"$10 – $20",
		]);
		expect(chips.map((c) => c.filter.kind)).toEqual([
			"category",
			"category",
			"facet",
			"facet",
			"type",
			"price",
		]);
		expect(chips[2].filter).toEqual({ kind: "facet", category: "disposables", key: "brand", value: "Waka" });
	});

	it("gives every chip its own id", () => {
		const chips = activeFilterChips(
			{
				cats: ["hardware"],
				range: [1, 2],
				facets: { hardware: { brand: ["A", "B"] } },
				types: ["RTA", "RDA"],
			},
			options,
		);
		expect(new Set(chips.map((c) => c.id)).size).toBe(chips.length);
	});

	it("falls back to the raw value for a sub-category it has no label for", () => {
		const chips = activeFilterChips({ ...emptyShopFilters(), types: ["Mystery"] }, options);
		expect(chips[0].label).toBe("Mystery");
	});
});
