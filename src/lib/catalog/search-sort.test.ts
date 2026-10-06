import { describe, expect, it } from "vitest";
import { type SearchSort, sortSearchResults } from "./search-sort";

type Item = { slug: string; name: string; price: number; created: string };

const item = (slug: string, overrides: Partial<Item> = {}): Item => ({
	slug,
	name: slug,
	price: 10,
	created: "2026-01-01T00:00:00Z",
	...overrides,
});

const slugs = (products: readonly Item[]) => products.map((p) => p.slug);
const flat = () => 1;

// Enough products that two different seeds all but certainly give different orders.
const many = Array.from({ length: 30 }, (_, i) =>
	item(`product-${i}`, { name: `Name ${29 - i}`, price: i % 3 }),
);

describe("sortSearchResults", () => {
	it("keeps every product, whatever the sort, and does not change its input", () => {
		const before = [...many];
		for (const sort of ["relevance", "price-asc", "price-desc", "newest", "name"] satisfies SearchSort[]) {
			expect(slugs(sortSearchResults(many, sort, flat, 7)).sort()).toEqual(slugs(many).sort());
		}
		expect(many).toEqual(before);
	});

	describe("relevance", () => {
		it("is random when everything matches equally, as with no search words", () => {
			const a = slugs(sortSearchResults(many, "relevance", flat, 3));
			expect(a).not.toEqual(slugs(many));
			expect(a).not.toEqual(slugs(sortSearchResults(many, "relevance", flat, 4)));
		});

		it("gives the same order for the same seed, however the products arrive", () => {
			const a = slugs(sortSearchResults(many, "relevance", flat, 3));
			expect(slugs(sortSearchResults(many, "relevance", flat, 3))).toEqual(a);
			expect(slugs(sortSearchResults([...many].reverse(), "relevance", flat, 3))).toEqual(a);
		});

		it("puts better matches first and shuffles only among equal ones", () => {
			const score = (p: Item) => (Number(p.slug.split("-")[1]) % 2 === 0 ? 4 : 1);
			const sorted = sortSearchResults(many, "relevance", score, 3);
			const scores = sorted.map(score);
			expect(scores).toEqual([...scores].sort((x, y) => y - x));
			const best = sorted.filter((p) => score(p) === 4);
			expect(slugs(best)).not.toEqual(slugs(many.filter((p) => score(p) === 4)));
		});
	});

	it("orders by price, shuffling products with equal prices", () => {
		const asc = sortSearchResults(many, "price-asc", flat, 5);
		const desc = sortSearchResults(many, "price-desc", flat, 5);
		expect(asc.map((p) => p.price)).toEqual([...asc.map((p) => p.price)].sort((x, y) => x - y));
		expect(desc.map((p) => p.price)).toEqual([...desc.map((p) => p.price)].sort((x, y) => y - x));
		const tier = (list: Item[]) => slugs(list.filter((p) => p.price === 1));
		expect(tier(asc)).not.toEqual(tier(sortSearchResults(many, "price-asc", flat, 6)));
	});

	it("orders newest first and by name, which are not shuffled", () => {
		const timed = [
			item("old", { created: "2026-01-01T00:00:00Z", name: "B" }),
			item("new", { created: "2026-03-01T00:00:00Z", name: "C" }),
			item("mid", { created: "2026-02-01T00:00:00Z", name: "A" }),
		];
		expect(slugs(sortSearchResults(timed, "newest", flat, 1))).toEqual(["new", "mid", "old"]);
		expect(slugs(sortSearchResults(timed, "name", flat, 1))).toEqual(["mid", "old", "new"]);
		expect(slugs(sortSearchResults(timed, "name", flat, 2))).toEqual(["mid", "old", "new"]);
	});
});
