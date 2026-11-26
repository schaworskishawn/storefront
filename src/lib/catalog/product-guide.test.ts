import { describe, expect, it } from "vitest";
import { parseProductGuide } from "./product-guide";

describe("parseProductGuide", () => {
	it("reads a site path and a title", () => {
		expect(
			parseProductGuide(
				JSON.stringify({ url: "/learn/how-to-rewrap-an-18650-battery", title: " How to re-wrap an 18650 " }),
			),
		).toEqual({ url: "/learn/how-to-rewrap-an-18650-battery", title: "How to re-wrap an 18650" });
	});

	it("ignores links off the site", () => {
		for (const url of [
			"https://example.com",
			"//example.com/x",
			"javascript:alert(1)",
			"learn/x",
			"/learn/x?y=<z>",
		]) {
			expect(parseProductGuide(JSON.stringify({ url, title: "Guide" }))).toBeNull();
		}
	});

	it("returns null for empty or malformed values", () => {
		expect(parseProductGuide(undefined)).toBeNull();
		expect(parseProductGuide("")).toBeNull();
		expect(parseProductGuide("nope")).toBeNull();
		expect(parseProductGuide("[]")).toBeNull();
		expect(parseProductGuide(JSON.stringify({ url: "/learn/x" }))).toBeNull();
		expect(parseProductGuide(JSON.stringify({ url: "/learn/x", title: "  " }))).toBeNull();
	});
});
