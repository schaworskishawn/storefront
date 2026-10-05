import { describe, expect, it } from "vitest";
import { NEWEST_BLOCK, sortProducts, type Sort, type SortableProduct } from "./product-sort";

const make = (i: number, over: Partial<SortableProduct> = {}): SortableProduct => ({
	slug: `product-${i}`,
	name: `Product ${String.fromCharCode(65 + (i % 26))}${i}`,
	price: 10 + (i % 5),
	created: `2026-10-0${1 + (i % 3)}T12:00:00Z`,
	isBestseller: false,
	...over,
});
const catalog = Array.from({ length: 60 }, (_, i) => make(i));
const slugs = (list: SortableProduct[]) => list.map((p) => p.slug);
const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

describe("sortProducts", () => {
	it("keeps every product exactly once and leaves the input alone", () => {
		const before = slugs(catalog);
		for (const sort of ["featured", "best-selling", "newest", "name", "price-asc", "price-desc"] as Sort[]) {
			expect(slugs(sortProducts(catalog, sort, 7)).sort()).toEqual([...before].sort());
		}
		expect(slugs(catalog)).toEqual(before);
	});

	it("is alphabetical for Name A-Z and nothing else", () => {
		const names = sortProducts(catalog, "name", 7).map((p) => p.name);
		expect(names).toEqual([...names].sort(cmp));
		for (const sort of ["featured", "best-selling", "newest"] as Sort[]) {
			const other = sortProducts(catalog, sort, 7).map((p) => p.name);
			expect(other).not.toEqual([...other].sort(cmp));
		}
	});

	it("shuffles Featured: the same for a seed, different for another", () => {
		expect(slugs(sortProducts(catalog, "featured", 3))).toEqual(slugs(sortProducts(catalog, "featured", 3)));
		expect(slugs(sortProducts(catalog, "featured", 3))).not.toEqual(
			slugs(sortProducts(catalog, "featured", 4)),
		);
	});

	it("puts flagged bestsellers first, shuffled among themselves, then everything else", () => {
		const list = catalog.map((p, i) => (i % 10 === 0 ? { ...p, isBestseller: true } : p));
		const sorted = sortProducts(list, "best-selling", 5);
		const flagged = list.filter((p) => p.isBestseller).length;
		expect(sorted.slice(0, flagged).every((p) => p.isBestseller)).toBe(true);
		expect(sorted.slice(flagged).some((p) => p.isBestseller)).toBe(false);
	});

	describe("New Arrivals", () => {
		// 60 products, each created a minute after the one before, so creation order is easy to read off.
		const timed = Array.from({ length: 60 }, (_, i) =>
			make(i, { created: new Date(Date.UTC(2026, 9, 3, 12, i)).toISOString() }),
		);
		const sorted = sortProducts(timed, "newest", 5);
		const newestFirst = [...timed].sort((a, b) => b.created.localeCompare(a.created));

		it("takes the newest products by creation time", () => {
			expect(new Set(slugs(sorted.slice(0, NEWEST_BLOCK)))).toEqual(
				new Set(slugs(newestFirst.slice(0, NEWEST_BLOCK))),
			);
			expect(NEWEST_BLOCK).toBe(8);
		});

		it("keeps each block of 8 together, in creation-time order from block to block", () => {
			for (let start = 0; start < timed.length; start += NEWEST_BLOCK) {
				expect(new Set(slugs(sorted.slice(start, start + NEWEST_BLOCK)))).toEqual(
					new Set(slugs(newestFirst.slice(start, start + NEWEST_BLOCK))),
				);
			}
		});

		it("shows each block in a shuffled order, not alphabetical and not by time", () => {
			const firstBlock = sorted.slice(0, NEWEST_BLOCK);
			expect(firstBlock.map((p) => p.name)).not.toEqual([...firstBlock.map((p) => p.name)].sort(cmp));
			expect(slugs(firstBlock)).not.toEqual(slugs(newestFirst.slice(0, NEWEST_BLOCK)));
		});

		it("gives a different order within the block for another seed, but the same products", () => {
			const other = sortProducts(timed, "newest", 6).slice(0, NEWEST_BLOCK);
			expect(new Set(slugs(other))).toEqual(new Set(slugs(sorted.slice(0, NEWEST_BLOCK))));
			expect(slugs(other)).not.toEqual(slugs(sorted.slice(0, NEWEST_BLOCK)));
		});

		it("breaks a creation-time tie the same way every time", () => {
			const same = Array.from({ length: 20 }, (_, i) => make(i, { created: "2026-10-03T12:00:00Z" }));
			expect(slugs(sortProducts(same, "newest", 3))).toEqual(
				slugs(sortProducts([...same].reverse(), "newest", 3)),
			);
		});
	});

	it("orders by price for the price sorts, with equal prices shuffled", () => {
		const asc = sortProducts(catalog, "price-asc", 5).map((p) => p.price);
		const desc = sortProducts(catalog, "price-desc", 5).map((p) => p.price);
		expect(asc).toEqual([...asc].sort((a, b) => a - b));
		expect(desc).toEqual([...desc].sort((a, b) => b - a));
		const sameTier = sortProducts(catalog, "price-asc", 5).filter((p) => p.price === 10);
		expect(sameTier.map((p) => p.name)).not.toEqual([...sameTier.map((p) => p.name)].sort(cmp));
	});

	it("gives a different Featured order than the same seed's Name order", () => {
		expect(slugs(sortProducts(catalog, "featured", 1))).not.toEqual(slugs(sortProducts(catalog, "name", 1)));
	});
});
