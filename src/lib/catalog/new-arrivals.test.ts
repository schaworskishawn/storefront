import { describe, expect, it } from "vitest";
import { newArrivalSlugs, newestFirst } from "./new-arrivals";

const catalog = [
	{ slug: "old", created: "2026-01-01T10:00:00Z" },
	{ slug: "newest", created: "2026-09-30T10:00:00Z" },
	{ slug: "middle", created: "2026-05-15T10:00:00Z" },
];

describe("newestFirst", () => {
	it("orders by created, newest first, without mutating the input", () => {
		expect(newestFirst(catalog).map((p) => p.slug)).toEqual(["newest", "middle", "old"]);
		expect(catalog.map((p) => p.slug)).toEqual(["old", "newest", "middle"]);
	});
});

describe("newArrivalSlugs", () => {
	it("returns the newest `count` slugs", () => {
		expect([...newArrivalSlugs(catalog, 2)].sort()).toEqual(["middle", "newest"]);
	});

	it("returns everything when the catalog is smaller than the count", () => {
		expect(newArrivalSlugs(catalog, 12).size).toBe(3);
	});

	it("returns an empty set for an empty catalog", () => {
		expect(newArrivalSlugs([]).size).toBe(0);
	});
});
