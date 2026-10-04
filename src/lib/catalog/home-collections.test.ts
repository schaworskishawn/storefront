import { describe, expect, it } from "vitest";
import { HOME_SECTION_SIZE, buildHomeSections, type HomeMembership } from "./home-collections";

type P = { id: string; slug: string; name: string; price: number; created: string; isBestseller: boolean };

// 120 products, each created a minute after the one before (index 119 is the newest).
const make = (i: number, over: Partial<P> = {}): P => ({
	id: `id-${i}`,
	slug: `product-${i}`,
	name: `Product ${String.fromCharCode(65 + (i % 26))}${i}`,
	price: 10 + (i % 7),
	created: new Date(Date.UTC(2026, 9, 3, 12, i)).toISOString(),
	isBestseller: false,
	...over,
});
const catalog = Array.from({ length: 120 }, (_, i) => make(i));
const ids = (list: P[]) => list.map((p) => p.id);
const none: HomeMembership = { staffPicks: [], originals: [], starterKits: [] };
const cmp = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
const allSections = (s: ReturnType<typeof buildHomeSections<P>>) => [
	...s.featured,
	...s.bestSellers,
	...s.staffPicks,
	...s.originals,
	...s.starterKits,
	...s.newArrivals,
];

const membership: HomeMembership = {
	staffPicks: ["id-3", "id-10", "id-20", "id-30", "id-40", "id-50", "id-60", "id-70"],
	starterKits: Array.from({ length: 12 }, (_, i) => `id-${80 + i}`), // 80..91
	originals: Array.from({ length: 48 }, (_, i) => `id-${i}`), // 0..47, overlaps the staff picks
};

describe("buildHomeSections", () => {
	const s = buildHomeSections(catalog, membership, 7);

	it("fills every section with up to eight products", () => {
		expect(HOME_SECTION_SIZE).toBe(8);
		for (const list of [s.featured, s.staffPicks, s.originals, s.starterKits, s.newArrivals]) {
			expect(list).toHaveLength(8);
		}
	});

	it("shows each product in one section only", () => {
		const all = ids(allSections(s));
		expect(new Set(all).size).toBe(all.length);
	});

	it("keeps each collection to its own products", () => {
		expect(s.staffPicks.every((p) => membership.staffPicks.includes(p.id))).toBe(true);
		expect(s.starterKits.every((p) => membership.starterKits.includes(p.id))).toBe(true);
		expect(s.originals.every((p) => membership.originals.includes(p.id))).toBe(true);
	});

	it("takes the newest products by creation time for New Arrivals", () => {
		expect(new Set(ids(s.newArrivals))).toEqual(
			new Set(Array.from({ length: 8 }, (_, i) => `id-${119 - i}`)),
		);
	});

	it("never lists a collection in alphabetical order", () => {
		for (const list of [s.featured, s.staffPicks, s.originals, s.starterKits, s.newArrivals]) {
			const names = list.map((p) => p.name);
			expect(names).not.toEqual([...names].sort(cmp));
		}
	});

	it("gives a product that is in two collections to the more specific one", () => {
		// id-3 and id-10 are staff picks and also originals: they appear under Staff Picks, not Originals.
		const staff = new Set(ids(s.staffPicks));
		for (const id of ["id-3", "id-10"]) {
			if (staff.has(id)) expect(ids(s.originals)).not.toContain(id);
		}
		expect(ids(s.staffPicks).filter((id) => membership.staffPicks.includes(id))).toHaveLength(8);
	});

	it("is the same for the same seed and a different order for another", () => {
		const again = buildHomeSections(catalog, membership, 7);
		expect(ids(again.featured)).toEqual(ids(s.featured));
		expect(ids(again.staffPicks)).toEqual(ids(s.staffPicks));
		const other = buildHomeSections(catalog, membership, 8);
		expect(ids(other.staffPicks)).not.toEqual(ids(s.staffPicks));
		expect(new Set(ids(other.staffPicks))).toEqual(new Set(ids(s.staffPicks)));
	});
});

describe("Best Sellers", () => {
	it("stays empty until products are actually flagged", () => {
		expect(buildHomeSections(catalog, membership, 3).bestSellers).toEqual([]);
	});

	it("shows only flagged products once there are some", () => {
		const flagged = catalog.map((p, i) => (i % 25 === 0 ? { ...p, isBestseller: true } : p));
		const s = buildHomeSections(flagged, membership, 3);
		expect(s.bestSellers.length).toBeGreaterThan(0);
		expect(s.bestSellers.every((p) => p.isBestseller)).toBe(true);
		const all = ids(allSections(s));
		expect(new Set(all).size).toBe(all.length);
	});
});

describe("when a collection is missing or empty", () => {
	it("leaves its section empty and still fills Featured and New Arrivals", () => {
		const s = buildHomeSections(catalog, none, 5);
		expect(s.staffPicks).toEqual([]);
		expect(s.originals).toEqual([]);
		expect(s.starterKits).toEqual([]);
		expect(s.featured).toHaveLength(8);
		expect(s.newArrivals).toHaveLength(8);
	});

	it("ignores collection ids that aren't in the catalog", () => {
		const s = buildHomeSections(catalog, { ...none, staffPicks: ["gone-1", "gone-2", "id-5"] }, 5);
		expect(ids(s.staffPicks)).toEqual(["id-5"]);
	});

	it("handles a catalog smaller than a section", () => {
		const s = buildHomeSections(catalog.slice(0, 5), membership, 5);
		expect(allSections(s).length).toBeLessThanOrEqual(5);
	});

	it("handles an empty catalog", () => {
		const s = buildHomeSections([], membership, 5);
		expect(allSections(s)).toEqual([]);
	});
});
