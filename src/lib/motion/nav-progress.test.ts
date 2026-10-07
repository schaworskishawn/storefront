import { describe, expect, it } from "vitest";
import { shouldStartProgress } from "./nav-progress";

const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false };
const here = { origin: "https://www.worldwidevapor.com", pathname: "/home" };
const link = (href: string, extra: Partial<{ target: string; download: boolean }> = {}) => ({
	href,
	target: "",
	download: false,
	...extra,
});

describe("shouldStartProgress", () => {
	it("starts for a link to another page on the same site", () => {
		expect(shouldStartProgress(plain, link("https://www.worldwidevapor.com/shop"), here)).toBe(true);
		expect(shouldStartProgress(plain, link("/shop?category=disposables"), here)).toBe(true);
	});

	it("does not start without a link", () => {
		expect(shouldStartProgress(plain, null, here)).toBe(false);
	});

	it("does not start for the page already open, a hash jump, or a query-only change", () => {
		expect(shouldStartProgress(plain, link("https://www.worldwidevapor.com/home"), here)).toBe(false);
		expect(shouldStartProgress(plain, link("/home#brands"), here)).toBe(false);
		expect(shouldStartProgress(plain, link("/home?x=1"), here)).toBe(false);
	});

	it("does not start for other sites, mail or phone links", () => {
		expect(shouldStartProgress(plain, link("https://example.com/shop"), here)).toBe(false);
		expect(shouldStartProgress(plain, link("mailto:support@worldwidevapor.com"), here)).toBe(false);
		expect(shouldStartProgress(plain, link("tel:+15555550100"), here)).toBe(false);
	});

	it("does not start for new tabs, downloads, modified clicks or other mouse buttons", () => {
		expect(shouldStartProgress(plain, link("/shop", { target: "_blank" }), here)).toBe(false);
		expect(shouldStartProgress(plain, link("/shop", { download: true }), here)).toBe(false);
		expect(shouldStartProgress({ ...plain, metaKey: true }, link("/shop"), here)).toBe(false);
		expect(shouldStartProgress({ ...plain, ctrlKey: true }, link("/shop"), here)).toBe(false);
		expect(shouldStartProgress({ ...plain, shiftKey: true }, link("/shop"), here)).toBe(false);
		expect(shouldStartProgress({ ...plain, altKey: true }, link("/shop"), here)).toBe(false);
		expect(shouldStartProgress({ ...plain, button: 1 }, link("/shop"), here)).toBe(false);
	});

	it("treats an explicit _self target like no target", () => {
		expect(shouldStartProgress(plain, link("/shop", { target: "_self" }), here)).toBe(true);
	});
});
