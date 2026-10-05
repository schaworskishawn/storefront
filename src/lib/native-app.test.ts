import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	NATIVE_APP_USER_AGENT_MARKER,
	activeNativeTab,
	isAndroidApp,
	shouldShowNativeTabBar,
	stripLocaleChannelPrefix,
} from "./native-app";

describe("isAndroidApp", () => {
	it("recognises Capacitor on Android", () => {
		expect(isAndroidApp({ Capacitor: { getPlatform: () => "android" } })).toBe(true);
	});

	it("is false on the web, on iOS, and when Capacitor is missing", () => {
		expect(isAndroidApp({ Capacitor: { getPlatform: () => "web" } })).toBe(false);
		expect(isAndroidApp({ Capacitor: { getPlatform: () => "ios" } })).toBe(false);
		expect(isAndroidApp({})).toBe(false);
		expect(
			isAndroidApp({ userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36" }),
		).toBe(false);
	});

	it("falls back to the marker the shell adds to the user agent", () => {
		expect(
			isAndroidApp({
				userAgent: `Mozilla/5.0 (Linux; Android 14; wv) Chrome/130 ${NATIVE_APP_USER_AGENT_MARKER}/1`,
			}),
		).toBe(true);
		expect(isAndroidApp({ userAgent: `Mozilla/5.0 (iPhone) ${NATIVE_APP_USER_AGENT_MARKER}/1` })).toBe(false);
	});
});

describe("capacitor.config.ts", () => {
	it("appends the same user-agent marker the site looks for", () => {
		const config = readFileSync(new URL("../../capacitor.config.ts", import.meta.url), "utf8");
		expect(config).toContain(`appendUserAgent: "${NATIVE_APP_USER_AGENT_MARKER}"`);
	});
});

describe("stripLocaleChannelPrefix", () => {
	it("removes a locale and channel prefix, and leaves other paths alone", () => {
		expect(stripLocaleChannelPrefix("/en/cad/orders")).toBe("/orders");
		expect(stripLocaleChannelPrefix("/en/cad")).toBe("/");
		expect(stripLocaleChannelPrefix("/en-US/default-channel/products/x")).toBe("/products/x");
		expect(stripLocaleChannelPrefix("/shop")).toBe("/shop");
		expect(stripLocaleChannelPrefix("/my-reviews")).toBe("/my-reviews");
		expect(stripLocaleChannelPrefix("/")).toBe("/");
	});
});

describe("activeNativeTab", () => {
	it.each([
		["/", "home"],
		["/home", "home"],
		["/shop", "shop"],
		["/shop/", "shop"],
		["/product/some-slug", "shop"],
		["/search", "shop"],
		["/en/cad/products/some-slug", "shop"],
		["/en/cad/categories/pods", "shop"],
		["/wishlist", "wishlist"],
		["/orders", "orders"],
		["/orders/abc", "orders"],
		["/en/cad/orders", "orders"],
		["/account", "account"],
		["/account-settings", "account"],
		["/addresses", "account"],
		["/payment-methods", "account"],
		["/my-reviews", "account"],
	])("%s is on the %s tab", (path, tab) => {
		expect(activeNativeTab(path)).toBe(tab);
	});

	it("matches whole path segments only, and leaves unrelated pages without a tab", () => {
		expect(activeNativeTab("/shopping-tips")).toBeNull();
		expect(activeNativeTab("/homepage-extra")).toBeNull();
		expect(activeNativeTab("/cart")).toBeNull();
		expect(activeNativeTab("/faqs")).toBeNull();
	});
});

describe("shouldShowNativeTabBar", () => {
	it("shows on ordinary pages", () => {
		for (const path of ["/", "/home", "/shop", "/cart", "/wishlist", "/en/cad/products/x", "/faqs"]) {
			expect(shouldShowNativeTabBar(path)).toBe(true);
		}
	});

	it("hides on the age gate, sign-in screens and checkout", () => {
		for (const path of [
			"/age-verification",
			"/site-password",
			"/login",
			"/en/cad/login",
			"/register",
			"/forgot-password",
			"/reset-password",
			"/verify-email",
			"/checkout",
			"/checkout/complete",
		]) {
			expect(shouldShowNativeTabBar(path)).toBe(false);
		}
	});
});
