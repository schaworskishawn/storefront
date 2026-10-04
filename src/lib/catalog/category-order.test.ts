import { describe, expect, it } from "vitest";
import { CATEGORY_ORDER, categoryRank } from "./category-order";

describe("categoryRank", () => {
	it("puts E-Liquid right after Disposables and above Hardware, with New Arrivals last", () => {
		const sorted = ["new-arrivals", "accessories", "hardware", "coils", "ejuice", "disposables"].sort(
			(a, b) => categoryRank(a) - categoryRank(b),
		);
		expect(sorted).toEqual(["disposables", "ejuice", "hardware", "coils", "accessories", "new-arrivals"]);
	});

	it("ranks the legacy e-liquid slugs with E-Liquid", () => {
		expect(categoryRank("e-liquids")).toBeLessThan(categoryRank("hardware"));
		expect(categoryRank("e-liquid")).toBeGreaterThan(categoryRank("disposables"));
	});

	it("puts unknown categories after the known ones", () => {
		expect(categoryRank("something-new")).toBe(CATEGORY_ORDER.length);
	});
});
