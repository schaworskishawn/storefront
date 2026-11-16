import { describe, expect, it } from "vitest";
import { pageWindow } from "./page-window";

describe("pageWindow", () => {
	it("shows every page when there are only a few", () => {
		expect(pageWindow(1, 1)).toEqual([1]);
		expect(pageWindow(2, 3)).toEqual([1, 2, 3]);
		expect(pageWindow(3, 5)).toEqual([1, 2, 3, 4, 5]);
	});

	it("keeps the first, the last and the pages around the current one, with gaps between", () => {
		expect(pageWindow(9, 17)).toEqual([1, "gap", 8, 9, 10, "gap", 17]);
	});

	it("near the ends, shows one gap", () => {
		expect(pageWindow(1, 17)).toEqual([1, 2, "gap", 17]);
		expect(pageWindow(17, 17)).toEqual([1, "gap", 16, 17]);
		expect(pageWindow(3, 17)).toEqual([1, 2, 3, 4, "gap", 17]);
	});

	it("shows the one page a gap would hide instead of the gap", () => {
		expect(pageWindow(4, 17)).toEqual([1, 2, 3, 4, 5, "gap", 17]);
		expect(pageWindow(14, 17)).toEqual([1, "gap", 13, 14, 15, 16, 17]);
	});

	it("widens around the current page with more siblings", () => {
		expect(pageWindow(9, 17, 2)).toEqual([1, "gap", 7, 8, 9, 10, 11, "gap", 17]);
	});

	it("never has more than 5 + 2 × siblings entries", () => {
		for (let count = 1; count <= 40; count++)
			for (let current = 1; current <= count; current++) {
				expect(pageWindow(current, count).length).toBeLessThanOrEqual(7);
				expect(pageWindow(current, count, 2).length).toBeLessThanOrEqual(9);
			}
	});

	it("clamps a page out of range, and has nothing for no pages", () => {
		expect(pageWindow(0, 5)).toEqual([1, 2, "gap", 5]);
		expect(pageWindow(99, 17)).toEqual([1, "gap", 16, 17]);
		expect(pageWindow(1, 0)).toEqual([]);
	});
});
