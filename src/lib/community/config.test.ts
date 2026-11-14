import { describe, expect, it } from "vitest";
import { isCommunityEnabled, readRedisConfig } from "./config";

describe("readRedisConfig", () => {
	it("reads the Vercel integration's names", () => {
		expect(readRedisConfig({ KV_REST_API_URL: "https://a", KV_REST_API_TOKEN: "t" })).toEqual({
			url: "https://a",
			token: "t",
		});
	});

	it("reads Upstash's own names, and prefers them", () => {
		expect(
			readRedisConfig({
				UPSTASH_REDIS_REST_URL: "https://u",
				UPSTASH_REDIS_REST_TOKEN: "ut",
				KV_REST_API_URL: "https://a",
				KV_REST_API_TOKEN: "t",
			}),
		).toEqual({ url: "https://u", token: "ut" });
	});

	it("is null until both halves are present", () => {
		expect(readRedisConfig({})).toBeNull();
		expect(readRedisConfig({ KV_REST_API_URL: "https://a" })).toBeNull();
		expect(readRedisConfig({ KV_REST_API_TOKEN: "t" })).toBeNull();
		expect(readRedisConfig({ KV_REST_API_URL: " ", KV_REST_API_TOKEN: " " })).toBeNull();
	});

	it("can be switched off", () => {
		const env = { KV_REST_API_URL: "https://a", KV_REST_API_TOKEN: "t" };
		expect(isCommunityEnabled(env)).toBe(true);
		for (const off of ["false", "0", "off", "NO", " False "])
			expect(isCommunityEnabled({ ...env, COMMUNITY_ENABLED: off }), off).toBe(false);
		expect(isCommunityEnabled({ ...env, COMMUNITY_ENABLED: "true" })).toBe(true);
	});
});
