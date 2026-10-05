import { describe, expect, it } from "vitest";
import { byShuffle, shuffleRank } from "./shuffle";

const slugs = Array.from({ length: 60 }, (_, i) => `product-${i}`);
const order = (seed: number, items: string[] = slugs) => [...items].sort(byShuffle(seed, (s) => s));

describe("shuffleRank", () => {
	it("is deterministic for the same seed and key", () => {
		expect(shuffleRank(7, "apple-churro")).toBe(shuffleRank(7, "apple-churro"));
	});

	it("changes with the seed", () => {
		expect(shuffleRank(1, "apple-churro")).not.toBe(shuffleRank(2, "apple-churro"));
	});

	it("returns an unsigned 32-bit integer", () => {
		for (const s of slugs) {
			const r = shuffleRank(12345, s);
			expect(Number.isInteger(r)).toBe(true);
			expect(r).toBeGreaterThanOrEqual(0);
			expect(r).toBeLessThan(2 ** 32);
		}
	});
});

describe("byShuffle", () => {
	it("keeps every item exactly once", () => {
		expect([...order(99)].sort()).toEqual([...slugs].sort());
	});

	it("gives the same order for the same seed", () => {
		expect(order(5)).toEqual(order(5));
	});

	it("gives a different order for a different seed", () => {
		expect(order(5)).not.toEqual(order(6));
	});

	it("does not leave the list alphabetical or in its original order", () => {
		expect(order(5)).not.toEqual([...slugs].sort());
		expect(order(5)).not.toEqual(slugs);
	});

	it("keeps the relative order of any subset (so filtering or paging does not reshuffle)", () => {
		const full = order(11);
		const subset = slugs.filter((_, i) => i % 3 === 0);
		const expected = full.filter((s) => subset.includes(s));
		expect(order(11, subset)).toEqual(expected);
	});
});
