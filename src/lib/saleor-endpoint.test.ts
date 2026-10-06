import { describe, expect, it } from "vitest";
import { saleorGraphqlUrl } from "./saleor-endpoint";

describe("saleorGraphqlUrl", () => {
	it("keeps the one trailing slash Saleor needs", () => {
		expect(saleorGraphqlUrl("https://store.saleor.cloud/graphql/")).toBe(
			"https://store.saleor.cloud/graphql/",
		);
	});

	it("adds the slash when the setting doesn't have it", () => {
		expect(saleorGraphqlUrl("https://store.saleor.cloud/graphql")).toBe(
			"https://store.saleor.cloud/graphql/",
		);
	});

	it("collapses repeated slashes and ignores surrounding whitespace", () => {
		expect(saleorGraphqlUrl("  https://store.saleor.cloud/graphql///  ")).toBe(
			"https://store.saleor.cloud/graphql/",
		);
	});

	it("is null when nothing is configured", () => {
		expect(saleorGraphqlUrl(undefined)).toBeNull();
		expect(saleorGraphqlUrl(null)).toBeNull();
		expect(saleorGraphqlUrl("")).toBeNull();
		expect(saleorGraphqlUrl("   ")).toBeNull();
	});
});
