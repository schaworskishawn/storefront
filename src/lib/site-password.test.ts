import { afterEach, describe, expect, it, vi } from "vitest";
import {
	checkSitePassword,
	getSitePassword,
	hasSiteAccess,
	safeEqual,
	safeSiteNextPath,
	sitePasswordToken,
} from "./site-password";

afterEach(() => {
	vi.unstubAllEnvs();
});

describe("getSitePassword", () => {
	it("is null when SITE_PASSWORD is unset or blank", () => {
		vi.stubEnv("SITE_PASSWORD", "");
		expect(getSitePassword()).toBeNull();
		vi.stubEnv("SITE_PASSWORD", "   ");
		expect(getSitePassword()).toBeNull();
	});

	it("returns the trimmed password when set", () => {
		vi.stubEnv("SITE_PASSWORD", " open-sesame\n");
		expect(getSitePassword()).toBe("open-sesame");
	});
});

describe("sitePasswordToken", () => {
	it("is a stable 64-character hex digest that is not the password", async () => {
		const token = await sitePasswordToken("open-sesame");
		expect(token).toMatch(/^[0-9a-f]{64}$/);
		expect(token).not.toContain("open-sesame");
		expect(await sitePasswordToken("open-sesame")).toBe(token);
	});

	it("differs per password and per secret", async () => {
		const a = await sitePasswordToken("one");
		expect(await sitePasswordToken("two")).not.toBe(a);
		vi.stubEnv("SITE_PASSWORD_SECRET", "another-secret");
		expect(await sitePasswordToken("one")).not.toBe(a);
	});
});

describe("safeEqual", () => {
	it("compares strings exactly", () => {
		expect(safeEqual("abc", "abc")).toBe(true);
		expect(safeEqual("abc", "abd")).toBe(false);
		expect(safeEqual("abc", "abcd")).toBe(false);
	});
});

describe("hasSiteAccess", () => {
	it("lets everyone in when the gate is off", async () => {
		vi.stubEnv("SITE_PASSWORD", "");
		expect(await hasSiteAccess(undefined)).toBe(true);
	});

	it("needs the cookie for the current password when the gate is on", async () => {
		vi.stubEnv("SITE_PASSWORD", "open-sesame");
		const good = await sitePasswordToken("open-sesame");
		expect(await hasSiteAccess(good)).toBe(true);
		expect(await hasSiteAccess(undefined)).toBe(false);
		expect(await hasSiteAccess("not-a-token")).toBe(false);
		expect(await hasSiteAccess(await sitePasswordToken("wrong"))).toBe(false);
	});

	it("invalidates old cookies when the password changes", async () => {
		vi.stubEnv("SITE_PASSWORD", "old-password");
		const oldToken = await sitePasswordToken("old-password");
		vi.stubEnv("SITE_PASSWORD", "new-password");
		expect(await hasSiteAccess(oldToken)).toBe(false);
	});
});

describe("checkSitePassword", () => {
	it("accepts only the configured password", async () => {
		vi.stubEnv("SITE_PASSWORD", "open-sesame");
		expect(await checkSitePassword("open-sesame")).toBe(true);
		expect(await checkSitePassword("Open-Sesame")).toBe(false);
		expect(await checkSitePassword("")).toBe(false);
	});

	it("rejects everything when the gate is off", async () => {
		vi.stubEnv("SITE_PASSWORD", "");
		expect(await checkSitePassword("")).toBe(false);
		expect(await checkSitePassword("anything")).toBe(false);
	});
});

describe("safeSiteNextPath", () => {
	it("keeps same-site relative paths", () => {
		expect(safeSiteNextPath("/shop?category=coils")).toBe("/shop?category=coils");
	});

	it("falls back to /home for missing, external or gate paths", () => {
		expect(safeSiteNextPath(null)).toBe("/home");
		expect(safeSiteNextPath("https://evil.example")).toBe("/home");
		expect(safeSiteNextPath("//evil.example")).toBe("/home");
		expect(safeSiteNextPath("/site-password?next=/shop")).toBe("/home");
		expect(safeSiteNextPath("/age-verification")).toBe("/home");
	});
});
