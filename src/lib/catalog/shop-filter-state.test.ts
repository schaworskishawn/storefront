import { describe, expect, it } from "vitest";
import { emptyShopFilters } from "./apply-shop-filters";
import { NEW_ARRIVALS_SLUG } from "./new-arrivals";
import {
	type ShopFilterAction,
	type ShopFilterState,
	initShopFilterState,
	pruneFacets,
	pruneTypes,
	shopFilterReducer,
} from "./shop-filter-state";

const bounds = { min: 5, max: 50 };

/** Runs the actions in order from a clean state (or `from`). */
const run = (actions: ShopFilterAction[], from: ShopFilterState = initShopFilterState()) =>
	actions.reduce(shopFilterReducer, from);

describe("initShopFilterState", () => {
	it("starts with nothing ticked", () => {
		expect(initShopFilterState()).toEqual({ draft: emptyShopFilters(), applied: emptyShopFilters() });
	});

	it("pre-applies the initial categories, as /shop?category=… does", () => {
		const state = initShopFilterState(["bundles"]);
		expect(state.draft.cats).toEqual(["bundles"]);
		expect(state.applied.cats).toEqual(["bundles"]);
	});
});

describe("ticking (draft only)", () => {
	it("ticking a category changes the draft but not what is applied", () => {
		const state = run([{ type: "toggle-category", slug: "hardware" }]);
		expect(state.draft.cats).toEqual(["hardware"]);
		expect(state.applied.cats).toEqual([]);
	});

	it("unticking a category also unticks what was ticked under it", () => {
		const state = run([
			{ type: "toggle-facet", category: "disposables", key: "brand", value: "Waka" },
			{ type: "toggle-type", value: "RTA" },
			{ type: "toggle-category", slug: "disposables" },
		]);
		expect(state.draft.cats).toEqual(["hardware"]);
		expect(state.draft.facets).toEqual({});
		// RTA sits under Hardware, so it stays.
		expect(state.draft.types).toEqual(["RTA"]);
	});

	it("ticking an attribute value ticks its category, and ticking it again removes the value", () => {
		const ticked = run([{ type: "toggle-facet", category: "disposables", key: "brand", value: "Waka" }]);
		expect(ticked.draft.cats).toEqual(["disposables"]);
		expect(ticked.draft.facets).toEqual({ disposables: { brand: ["Waka"] } });
		const unticked = run(
			[{ type: "toggle-facet", category: "disposables", key: "brand", value: "Waka" }],
			ticked,
		);
		expect(unticked.draft.facets).toEqual({ disposables: { brand: [] } });
		// The category stays ticked.
		expect(unticked.draft.cats).toEqual(["disposables"]);
	});

	it("keeps several values of one group and values of different groups", () => {
		const state = run([
			{ type: "toggle-facet", category: "disposables", key: "brand", value: "Waka" },
			{ type: "toggle-facet", category: "disposables", key: "brand", value: "Kraze" },
			{ type: "toggle-facet", category: "disposables", key: "puff-count", value: "20K" },
		]);
		expect(state.draft.facets).toEqual({ disposables: { brand: ["Waka", "Kraze"], "puff-count": ["20K"] } });
	});

	it("ticking a sub-category ticks the category it sits under", () => {
		const state = run([{ type: "toggle-type", value: "Pod Mod" }]);
		expect(state.draft.cats).toEqual(["hardware"]);
		expect(state.draft.types).toEqual(["Pod Mod"]);
		expect(run([{ type: "toggle-type", value: "Pod Mod" }], state).draft.types).toEqual([]);
	});

	it("ticking a category under New Arrivals also ticks New Arrivals", () => {
		const state = run([{ type: "toggle-under-new-arrivals", slug: "hardware" }]);
		expect(state.draft.cats).toEqual(["hardware", NEW_ARRIVALS_SLUG]);
		const again = run([{ type: "toggle-under-new-arrivals", slug: "hardware" }], state);
		expect(again.draft.cats).toEqual([NEW_ARRIVALS_SLUG]);
	});

	it("keeps the dragged price range in the draft", () => {
		expect(run([{ type: "set-range", range: [10, 20] }]).draft.range).toEqual([10, 20]);
	});
});

describe("apply", () => {
	it("copies the draft across, with the price range normalised against the bounds", () => {
		const state = run([
			{ type: "toggle-category", slug: "hardware" },
			{ type: "toggle-facet", category: "disposables", key: "brand", value: "Waka" },
			{ type: "set-range", range: [10, 20] },
			{ type: "apply", bounds },
		]);
		expect(state.applied).toEqual({
			cats: ["hardware", "disposables"],
			range: [10, 20],
			facets: { disposables: { brand: ["Waka"] } },
			types: [],
		});
	});

	it("applies a range that spans the whole bounds as no price filter", () => {
		const state = run([
			{ type: "set-range", range: [0, 99] },
			{ type: "apply", bounds },
		]);
		expect(state.applied.range).toBeNull();
	});

	it("applies untouched sliders as no price filter", () => {
		expect(run([{ type: "apply", bounds }]).applied.range).toBeNull();
	});

	it("leaves out values whose category is no longer ticked", () => {
		const state = run([
			{ type: "toggle-facet", category: "disposables", key: "brand", value: "Waka" },
			{ type: "toggle-type", value: "RTA" },
		]);
		// Stale values the shopper unticked the category under, as if left behind in the draft.
		const stale: ShopFilterState = { ...state, draft: { ...state.draft, cats: [] } };
		const applied = run([{ type: "apply", bounds }], stale).applied;
		expect(applied.facets).toEqual({});
		expect(applied.types).toEqual([]);
	});
});

describe("one-click changes (draft and applied together)", () => {
	const ticked = run([
		{ type: "toggle-facet", category: "disposables", key: "brand", value: "Waka" },
		{ type: "toggle-type", value: "RTA" },
		{ type: "set-range", range: [10, 20] },
		{ type: "apply", bounds },
	]);

	it("selecting a category starts it from a clean slate but keeps the price range", () => {
		const state = run([{ type: "select-category", slug: "coils" }], ticked);
		for (const selection of [state.draft, state.applied]) {
			expect(selection.cats).toEqual(["coils"]);
			expect(selection.facets).toEqual({});
			expect(selection.types).toEqual([]);
		}
		expect(state.applied.range).toEqual([10, 20]);
		expect(state.draft.range).toEqual([10, 20]);
	});

	it("selecting null shows every category", () => {
		const state = run([{ type: "select-category", slug: null }], ticked);
		expect(state.draft.cats).toEqual([]);
		expect(state.applied.cats).toEqual([]);
	});

	it("clear-all empties both selections, price included", () => {
		const state = run([{ type: "clear-all" }], ticked);
		expect(state).toEqual({ draft: emptyShopFilters(), applied: emptyShopFilters() });
	});
});

describe("removing one active filter", () => {
	const ticked = run([
		{ type: "toggle-facet", category: "disposables", key: "brand", value: "Waka" },
		{ type: "toggle-facet", category: "disposables", key: "puff-count", value: "20K" },
		{ type: "toggle-type", value: "RTA" },
		{ type: "toggle-type", value: "Pod Mod" },
		{ type: "set-range", range: [10, 20] },
		{ type: "apply", bounds },
	]);

	it("removes an attribute value from the applied selection and the draft, leaving the rest", () => {
		const state = run(
			[{ type: "remove", filter: { kind: "facet", category: "disposables", key: "brand", value: "Waka" } }],
			ticked,
		);
		for (const selection of [state.draft, state.applied]) {
			expect(selection.facets).toEqual({ disposables: { brand: [], "puff-count": ["20K"] } });
			expect(selection.cats).toEqual(["disposables", "hardware"]);
		}
	});

	it("removes a sub-category from both", () => {
		const state = run([{ type: "remove", filter: { kind: "type", value: "RTA" } }], ticked);
		expect(state.draft.types).toEqual(["Pod Mod"]);
		expect(state.applied.types).toEqual(["Pod Mod"]);
	});

	it("removes the price range from both", () => {
		const state = run([{ type: "remove", filter: { kind: "price" } }], ticked);
		expect(state.draft.range).toBeNull();
		expect(state.applied.range).toBeNull();
	});

	it("removes a category together with everything ticked under it", () => {
		const state = run([{ type: "remove", filter: { kind: "category", slug: "hardware" } }], ticked);
		for (const selection of [state.draft, state.applied]) {
			expect(selection.cats).toEqual(["disposables"]);
			expect(selection.types).toEqual([]);
			expect(selection.facets).toEqual({ disposables: { brand: ["Waka"], "puff-count": ["20K"] } });
		}
	});

	it("removes values the draft never applied from the draft too", () => {
		const withDraftOnly = run(
			[{ type: "toggle-facet", category: "ejuice", key: "brand", value: "Geek Bar" }],
			ticked,
		);
		const state = run([{ type: "remove", filter: { kind: "category", slug: "ejuice" } }], withDraftOnly);
		expect(state.draft.cats).not.toContain("ejuice");
		expect(state.draft.facets.ejuice).toBeUndefined();
	});

	it("ignores a value that is not there", () => {
		const state = run(
			[{ type: "remove", filter: { kind: "facet", category: "ejuice", key: "brand", value: "Nope" } }],
			ticked,
		);
		expect(state).toEqual(ticked);
	});
});

describe("pruneFacets / pruneTypes", () => {
	it("keep only what sits under a ticked category", () => {
		const facets = { disposables: { brand: ["Waka"] }, ejuice: { brand: ["Geek Bar"] } };
		expect(pruneFacets(facets, ["ejuice"])).toEqual({ ejuice: { brand: ["Geek Bar"] } });
		expect(pruneTypes(["RTA", "Charger", "Disposables"], ["hardware"])).toEqual(["RTA"]);
		expect(pruneTypes(["RTA"], [])).toEqual([]);
	});
});
